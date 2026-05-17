import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { isEntryLocked, validateAppendOnlyDiff } from '@/lib/entry-lock'
import { parseStyle } from '@/lib/entry-style'

// GET - Fetch single entry (only if owned by user)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: {
        doodles: true,
        photos: true,
      },
    })

    if (!entry) {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      )
    }

    if (entry.userId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    // All entries are E2EE — return ciphertext as-is; client decrypts.
    return NextResponse.json({
      ...entry,
      e2eeIVs: entry.e2eeIVs,
      spreads: entry.spreads,
      isArchived: entry.isArchived,
      photos: entry.photos,
      style: parseStyle(entry.style),
    })
  } catch (error) {
    console.error('Error fetching entry:', error)
    return NextResponse.json(
      { error: 'Failed to fetch entry' },
      { status: 500 }
    )
  }
}

// PUT - Update entry (only if owned by user)
// Supports append-only updates: add text, add photos, add doodles, add spreads
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Load enough state up-front to run the lock check below. For letter drafts
    // the lock is calendar-day-based (like normal entries — letter drafts are
    // always unsealed until the Letter row is created; then the JE draft is
    // deleted, so a sealed JE never reaches this path).
    const existing = await prisma.journalEntry.findUnique({
      where: { id },
      select: {
        userId: true,
        e2eeIVs: true,
        createdAt: true,
        text: true,
        song: true,
        entryType: true,
        style: true,
        photos: { select: { spread: true, position: true } },
        doodles: { select: { spread: true } },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    if (existing.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const {
      text, song, tags, e2eeIVs,
      spreads, appendText, newPhotos, newDoodles,
      style,
      // Full-replacement doodle/photo lists (autosave wire format). When the
      // client sends `doodles` / `photos` as the entry's complete current
      // state, the corresponding set is replaced to match — required for
      // clears/deletions to actually persist. The legacy `newDoodles` /
      // `newPhotos` fields above stay append-only for callers that
      // explicitly want that semantic.
      doodles,
      photos,
    } = body

    // /api/entries only handles journal entries now — letters live in the
    // `letters` table. Refuse to touch any row that's somehow not a journal
    // entry (legacy letter/unsent_letter rows should be migrated/deleted out
    // of journal_entries; this guard catches any that linger).
    if (existing.entryType !== 'normal') {
      return NextResponse.json(
        { error: 'This row is not a journal entry — use /api/letters/drafts.' },
        { status: 400 },
      )
    }

    // Lock check. For normal entries: calendar-day → append-only diff allowed.
    const userTz = request.headers.get('x-user-tz') ?? 'UTC'
    const locked = isEntryLocked(existing.createdAt, userTz, {
      entryType: existing.entryType,
      isSealed: false,
    })
    if (locked) {
      // All entries are E2EE: text on the row is ciphertext. For the
      // append-only diff check we pass the ciphertext as the "old text" — the
      // diff validator compares structures, not plaintexts, so this is safe.
      const diff = validateAppendOnlyDiff({
        oldText: existing.text,
        newText: text,
        appendText,
        oldSong: existing.song,
        newSong: song,
        oldStyle: existing.style,
        newStyle: style,
        oldPhotos: existing.photos,
        newPhotoSlots: newPhotos?.map((p: { spread: number; position: number }) => ({
          spread: p.spread,
          position: p.position,
        })),
        oldDoodleSpreads: existing.doodles.map((d: { spread: number }) => d.spread),
        newDoodleSpreads: newDoodles?.map((d: { spread?: number }) => d.spread ?? 1),
      })
      if (!diff.ok) {
        return NextResponse.json({ error: diff.reason }, { status: 403 })
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {}

    // All entries are E2EE: text arrives as ciphertext from the client.
    // Store as-is; server never encrypts or decrypts entry content.
    if (text !== undefined) {
      updateData.text = text
      updateData.textPreview = '[Encrypted]'
    }

    // Handle append text (for append-only editing)
    if (appendText) {
      const currentEntry = await prisma.journalEntry.findUnique({
        where: { id },
        select: { text: true },
      })
      if (currentEntry) {
        // Append is only valid for unlocked entries in practice; for E2EE
        // the client is responsible for re-encrypting the combined text and
        // sending it as `text`. This path is kept for compatibility.
        const newText = `${currentEntry.text}<p>${appendText}</p>`
        updateData.text = newText
        updateData.textPreview = '[Encrypted]'
      }
    }

    if (style !== undefined) {
      updateData.style = parseStyle(style)
    }
    if (song !== undefined) updateData.song = song
    if (tags !== undefined) updateData.tags = tags
    if (spreads !== undefined) updateData.spreads = spreads
    if (e2eeIVs !== undefined) updateData.e2eeIVs = e2eeIVs

    // Update the entry
    await prisma.journalEntry.update({
      where: { id },
      data: updateData,
    })

    // Add new photos if provided (append-only). Photo bytes are already in
    // storage — the client uploaded them via /api/photos before sending this
    // request, so we only persist the reference here.
    if (newPhotos && newPhotos.length > 0) {
      await prisma.entryPhoto.createMany({
        data: newPhotos.map((p: {
          url?: string | null
          position: number
          spread: number
          rotation?: number
          encryptedRef?: string | null
          encryptedRefIV?: string | null
        }) => ({
          entryId: id,
          url: p.url ?? null,
          position: p.position,
          spread: p.spread,
          rotation: p.rotation ?? 0,
          encryptedRef: p.encryptedRef ?? null,
          encryptedRefIV: p.encryptedRefIV ?? null,
        })),
        skipDuplicates: true,
      })
    }

    // Add new doodles if provided (append-only)
    if (newDoodles && newDoodles.length > 0) {
      for (const d of newDoodles) {
        // Check if doodle exists for this spread
        const existingDoodle = await prisma.doodle.findFirst({
          where: { journalEntryId: id, spread: d.spread || 1 },
        })

        if (!existingDoodle) {
          await prisma.doodle.create({
            data: {
              journalEntryId: id,
              strokes: d.strokes,
              spread: d.spread || 1,
              positionInEntry: d.positionInEntry || 0,
            },
          })
        }
      }
    }

    // Full-replacement photos. Replaces the entry's photo set with the
    // incoming list — required so removing a photo (`photos` shrinks)
    // actually deletes the row from the DB. Only applied to unlocked
    // entries; locked journal entries must go through the append-only
    // newPhotos path, and sealed letters reject the whole request earlier.
    if (!locked && Array.isArray(photos)) {
      await prisma.entryPhoto.deleteMany({ where: { entryId: id } })
      if (photos.length > 0) {
        await prisma.entryPhoto.createMany({
          data: photos.map((p: {
            url?: string | null
            position: number
            spread?: number
            rotation?: number
            encryptedRef?: string | null
            encryptedRefIV?: string | null
          }) => ({
            entryId: id,
            url: p.url ?? null,
            position: p.position,
            spread: p.spread ?? 1,
            rotation: p.rotation ?? 0,
            encryptedRef: p.encryptedRef ?? null,
            encryptedRefIV: p.encryptedRefIV ?? null,
          })),
        })
      }
    }

    // Full-replacement doodles. Replaces the entry's doodle set with the
    // incoming list — required so a cleared canvas (`doodles: []`) actually
    // removes the row from the DB. Only applied to unlocked entries; locked
    // journal entries must go through the append-only newDoodles path, and
    // sealed letters reject the whole request earlier in this handler.
    if (!locked && Array.isArray(doodles)) {
      await prisma.doodle.deleteMany({ where: { journalEntryId: id } })
      for (let i = 0; i < doodles.length; i++) {
        const d = doodles[i]
        await prisma.doodle.create({
          data: {
            journalEntryId: id,
            strokes: d.strokes,
            spread: d.spread ?? 1,
            positionInEntry: d.positionInEntry ?? i,
          },
        })
      }
    }

    // Fetch updated entry with all relations
    const updatedEntry = await prisma.journalEntry.findUnique({
      where: { id },
      include: {
        doodles: true,
        photos: true,
      },
    })

    // All entries are E2EE — return ciphertext as-is; client decrypts.
    return NextResponse.json({
      ...updatedEntry,
      e2eeIVs: updatedEntry?.e2eeIVs,
      spreads: updatedEntry?.spreads,
      isArchived: updatedEntry?.isArchived,
      photos: updatedEntry?.photos,
      style: parseStyle(updatedEntry?.style),
    })
  } catch (error) {
    // Surface the underlying message + stack head so production 500s aren't
    // a black box. Only the catch text leaks — never the request body.
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack?.split('\n').slice(0, 4).join('\n') : undefined
    console.error('Error updating entry:', { message, stack })
    return NextResponse.json(
      { error: 'Failed to update entry', details: message, stack },
      { status: 500 }
    )
  }
}

// PATCH - Archive/unarchive entry
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Verify ownership
    const existing = await prisma.journalEntry.findUnique({
      where: { id },
      select: { userId: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    if (existing.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { isArchived } = body

    if (typeof isArchived !== 'boolean') {
      return NextResponse.json({ error: 'isArchived must be a boolean' }, { status: 400 })
    }

    const entry = await prisma.journalEntry.update({
      where: { id },
      data: { isArchived },
      include: {
        doodles: true,
        photos: true,
      },
    })

    return NextResponse.json({
      id: entry.id,
      isArchived: entry.isArchived,
      message: isArchived ? 'Entry archived' : 'Entry restored',
    })
  } catch (error) {
    console.error('Error archiving entry:', error)
    return NextResponse.json(
      { error: 'Failed to archive entry' },
      { status: 500 }
    )
  }
}

// DELETE - Permanently delete entry (only if owned by user)
// For two-step deletion: first archive (PATCH), then permanently delete (DELETE)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'

    // Verify ownership
    const existing = await prisma.journalEntry.findUnique({
      where: { id },
      select: { userId: true, isArchived: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    if (existing.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // If not force delete and not archived, just archive it
    if (!force && !existing.isArchived) {
      const entry = await prisma.journalEntry.update({
        where: { id },
        data: { isArchived: true },
      })
      return NextResponse.json({
        id: entry.id,
        isArchived: true,
        message: 'Entry archived. Use DELETE with ?force=true or from archive view to permanently delete.',
      })
    }

    // Permanently delete
    await prisma.journalEntry.delete({
      where: { id },
    })

    return NextResponse.json({ success: true, message: 'Entry permanently deleted' })
  } catch (error) {
    console.error('Error deleting entry:', error)
    return NextResponse.json(
      { error: 'Failed to delete entry' },
      { status: 500 }
    )
  }
}
