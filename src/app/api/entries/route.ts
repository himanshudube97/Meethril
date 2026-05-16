import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { encrypt, decryptEntryFields } from '@/lib/encryption'
import { isEntryLocked, utcInstantForLocalDate, localDatePartsNow } from '@/lib/entry-lock'
import { parseStyle } from '@/lib/entry-style'

// Helper to strip HTML and create preview
function createPreview(html: string | null | undefined, maxLength = 150): string {
  if (!html) return ''
  const text = html.replace(/<[^>]*>/g, '').trim()
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trim() + '...'
}

// GET - Fetch entries with pagination and filters
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    // Pagination params
    const cursor = searchParams.get('cursor')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

    // Filter params
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    const search = searchParams.get('search')
    const today = searchParams.get('today') === 'true'
    const entryType = searchParams.get('entryType')
    const includeArchived = searchParams.get('includeArchived') === 'true'

    // What to include
    const includeDoodles = searchParams.get('includeDoodles') !== 'false'
    const includePhotos = searchParams.get('includePhotos') !== 'false'

    // Build date range filter. Compute boundaries in the user's tz, not the
    // server's, so an entry written at midnight in the user's local time lands
    // in the right month/day window even when the server runs in UTC.
    const userTz = request.headers.get('x-user-tz') ?? 'UTC'
    let dateFilter: { gte?: Date; lt?: Date } | undefined

    if (today) {
      const { year: ty, month0: tm, day: td } = localDatePartsNow(userTz)
      const todayStart = utcInstantForLocalDate(ty, tm, td, userTz)
      const todayEnd = utcInstantForLocalDate(ty, tm, td + 1, userTz)
      dateFilter = { gte: todayStart, lt: todayEnd }
    } else if (month) {
      const [y, m] = month.split('-').map(Number)
      const monthStart = utcInstantForLocalDate(y, m - 1, 1, userTz)
      const monthEnd = utcInstantForLocalDate(y, m, 1, userTz)
      dateFilter = { gte: monthStart, lt: monthEnd }
    } else if (year) {
      const y = parseInt(year)
      const yearStart = utcInstantForLocalDate(y, 0, 1, userTz)
      const yearEnd = utcInstantForLocalDate(y + 1, 0, 1, userTz)
      dateFilter = { gte: yearStart, lt: yearEnd }
    }

    // Build where clause
    const where: {
      userId: string
      createdAt?: { gte?: Date; lt?: Date }
      text?: { contains: string; mode: 'insensitive' }
      entryType?: string
      isArchived?: boolean
    } = {
      userId: user.id,
      // Exclude archived entries by default
      isArchived: includeArchived ? undefined : false,
    }

    if (dateFilter) {
      where.createdAt = dateFilter
    }

    if (search) {
      where.text = { contains: search, mode: 'insensitive' }
    }

    if (entryType) {
      where.entryType = entryType
    }

    // Build query
    const entries = await prisma.journalEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      include: {
        doodles: includeDoodles,
        photos: includePhotos,
      },
    })

    // Check if there are more entries
    const hasMore = entries.length > limit
    const returnEntries = hasMore ? entries.slice(0, -1) : entries
    const nextCursor = hasMore ? returnEntries[returnEntries.length - 1]?.id : null

    // Decrypt and transform entries
    const transformedEntries = returnEntries.map(entry => {
      const isE2EE = entry.encryptionType === 'e2ee'
      const decrypted = isE2EE ? entry : decryptEntryFields(entry)

      return {
        ...decrypted,
        textPreview: isE2EE ? decrypted.textPreview : (decrypted.textPreview || createPreview(decrypted.text)),
        doodles: entry.doodles || [],
        photos: entry.photos || [],
        spreads: entry.spreads || 1,
        isArchived: entry.isArchived,
        encryptionType: entry.encryptionType,
        e2eeIV: entry.e2eeIV,
        style: parseStyle(entry.style),
      }
    })

    return NextResponse.json({
      entries: transformedEntries,
      pagination: {
        hasMore,
        nextCursor,
        limit,
      },
    })
  } catch (error) {
    console.error('Error fetching entries:', error)
    return NextResponse.json(
      { error: 'Failed to fetch entries' },
      { status: 500 }
    )
  }
}

// POST - Create new entry for current user
export async function POST(request: NextRequest) {
  try {
    console.log('[POST /api/entries] Starting...')

    const user = await getCurrentUser()
    console.log('[POST /api/entries] User:', user ? user.id : 'null')

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    console.log('[POST /api/entries] Body:', JSON.stringify(body).slice(0, 200))

    const {
      text, song, tags, doodles, entryType,
      encryptionType, e2eeIV, e2eeIVs,
      // New fields
      photos, spreads,
      // New: per-entry style
      style,
    } = body

    // Enforce one-normal-entry-per-day. Letters and other special types
    // are not subject to this rule. We look at the user's recent normal
    // entries and use isEntryLocked() to determine "created today in the
    // user's timezone" (false = today). A 2-day window is more than enough
    // to cover any TZ.
    const effectiveType = entryType || 'normal'
    if (effectiveType === 'normal') {
      const userTz = request.headers.get('x-user-tz') ?? 'UTC'
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      const recentNormal = await prisma.journalEntry.findMany({
        where: {
          userId: user.id,
          entryType: 'normal',
          isArchived: false,
          createdAt: { gte: twoDaysAgo },
        },
        select: { id: true, createdAt: true },
      })
      const todayExists = recentNormal.some(
        (e) => !isEntryLocked(e.createdAt, userTz, { entryType: 'normal' })
      )
      if (todayExists) {
        return NextResponse.json(
          { error: 'An entry already exists for today. Edit that one instead.' },
          { status: 409 }
        )
      }
    }

    // Check if this is an E2EE entry
    const isE2EE = encryptionType === 'e2ee'

    // Create preview
    const textPreview = isE2EE ? '[Encrypted]' : createPreview(text)
    console.log('[POST /api/entries] Preview:', textPreview?.slice(0, 50), 'E2EE:', isE2EE)

    // Encrypt sensitive fields
    console.log('[POST /api/entries] Encrypting text, length:', text?.length || 0)
    const encryptedText = isE2EE ? text : encrypt(text)
    const encryptedTextPreview = isE2EE ? textPreview : encrypt(textPreview)

    console.log('[POST /api/entries] Creating entry for user:', user.id, 'photos:', photos?.length || 0, 'doodles:', doodles?.length || 0)

    const entry = await prisma.journalEntry.create({
      data: {
        text: encryptedText,
        textPreview: encryptedTextPreview,
        song: song || null,
        tags: tags ?? [],
        style: style !== undefined ? (parseStyle(style) as Prisma.InputJsonValue) : Prisma.JsonNull,
        userId: user.id,
        entryType: entryType || 'normal',
        // E2EE fields
        encryptionType: encryptionType || 'server',
        e2eeIV: e2eeIV || null,
        e2eeIVs: e2eeIVs ?? undefined,
        // New multi-spread fields
        spreads: spreads ?? 1,
        isArchived: false,
        // Create doodles
        doodles: doodles && doodles.length > 0
          ? {
              create: doodles.map((d: { strokes: unknown; positionInEntry?: number; spread?: number }, index: number) => ({
                strokes: d.strokes,
                positionInEntry: d.positionInEntry ?? index,
                spread: d.spread ?? 1,
              })),
            }
          : undefined,
        // Create photos. Photo bytes themselves are uploaded client-side via
        // /api/photos before this request lands; we only persist the reference
        // (handle URL for non-E2EE, encryptedRef pair for E2EE).
        photos: photos && photos.length > 0
          ? {
              create: photos.map((p: {
                url?: string | null
                position: number
                spread: number
                rotation?: number
                encryptedRef?: string | null
                encryptedRefIV?: string | null
              }) => ({
                url: p.url ?? null,
                position: p.position,
                spread: p.spread,
                rotation: p.rotation ?? 0,
                encryptedRef: p.encryptedRef ?? null,
                encryptedRefIV: p.encryptedRefIV ?? null,
              })),
            }
          : undefined,
      },
      include: {
        doodles: true,
        photos: true,
      },
    })

    console.log('[POST /api/entries] Created entry:', entry.id)

    const responseEntry = isE2EE ? entry : decryptEntryFields(entry)
    return NextResponse.json({
      ...responseEntry,
      encryptionType: entry.encryptionType,
      e2eeIV: entry.e2eeIV,
      spreads: entry.spreads,
      photos: entry.photos,
      style: parseStyle(entry.style),
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating entry:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    const stack = error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : ''
    console.error('[POST /api/entries] Stack:', stack)
    return NextResponse.json(
      { error: 'Failed to create entry', details: message },
      { status: 500 }
    )
  }
}
