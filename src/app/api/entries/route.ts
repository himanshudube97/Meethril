import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { isEntryLocked, utcInstantForLocalDate, localDatePartsNow } from '@/lib/entry-lock'
import { parseStyle } from '@/lib/entry-style'

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

    // journal_entries is now journal-only; letters live in the `letters` table.
    // Legacy letter/unsent_letter rows are filtered out so they can't leak into
    // the shelf, memory, desk and archive views during cleanup.
    where.entryType = entryType || 'normal'

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

    // All entries are E2EE — pass through ciphertext as-is; client decrypts.
    const transformedEntries = returnEntries.map(entry => {
      return {
        ...entry,
        // textPreview is ciphertext for E2EE entries; return as-is
        textPreview: entry.textPreview,
        doodles: entry.doodles || [],
        photos: entry.photos || [],
        spreads: entry.spreads || 1,
        isArchived: entry.isArchived,
        e2eeIVs: entry.e2eeIVs,
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
      text, song, tags, doodles,
      e2eeIVs,
      // New fields
      photos, spreads,
      // New: per-entry style
      style,
    } = body

    // /api/entries only handles journal entries now — letters live in the
    // `letters` table and go through /api/letters/*. Enforce
    // one-entry-per-day for journals here.
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

    // All entries are E2EE: text and textPreview arrive as ciphertext from the client.
    // Store them as-is; the server never encrypts or decrypts entry content.
    const textPreview = '[Encrypted]'
    console.log('[POST /api/entries] Preview: [Encrypted] (E2EE)')
    console.log('[POST /api/entries] Storing E2EE ciphertext, length:', text?.length || 0)

    console.log('[POST /api/entries] Creating entry for user:', user.id, 'photos:', photos?.length || 0, 'doodles:', doodles?.length || 0)

    const entry = await prisma.journalEntry.create({
      data: {
        text: text ?? '',
        textPreview,
        song: song || null,
        tags: tags ?? [],
        style: style !== undefined ? (parseStyle(style) as Prisma.InputJsonValue) : Prisma.JsonNull,
        userId: user.id,
        entryType: 'normal',
        // E2EE per-field IV map
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
        // (encryptedRef pair for E2EE).
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

    return NextResponse.json({
      ...entry,
      e2eeIVs: entry.e2eeIVs,
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
