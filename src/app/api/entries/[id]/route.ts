import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { encrypt, decryptEntryFields } from '@/lib/encryption'
import { isEntryLocked, validateAppendOnlyDiff } from '@/lib/entry-lock'
import { parseStyle } from '@/lib/entry-style'

// Helper to strip HTML and create preview
function createPreview(html: string, maxLength = 150): string {
  const text = html.replace(/<[^>]*>/g, '').trim()
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trim() + '...'
}

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

    const isE2EE = entry.encryptionType === 'e2ee'
    const decryptedEntry = isE2EE ? entry : decryptEntryFields(entry)
    return NextResponse.json({
      ...decryptedEntry,
      encryptionType: entry.encryptionType,
      e2eeIV: entry.e2eeIV,
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
        encryptionType: true,
        e2eeIV: true,
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
      text, song, tags, encryptionType, e2eeIV, e2eeIVs,
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
      // entryType is kept so letter drafts (letter/unsent_letter) can set their
      // type during autosave. The letter-specific detail fields (recipientEmail,
      // recipientName, senderName, letterLocation, unlockDate) are no longer
      // stored on JournalEntry — they live on the Letter row created at seal time.
      entryType,
    } = body

    const bodyIsE2EE = encryptionType === 'e2ee'
    const existingIsE2EE = existing.encryptionType === 'e2ee'

    // Defense against a race we hit in production: client autosave fires
    // before the E2EE store has initialized, body omits `encryptionType`, and
    // we used to fall back to `existing.encryptionType === 'e2ee'`. That path
    // stored plaintext text into a row flagged as e2ee — atob() would then
    // crash on read. Reject loudly instead so the client retries once unlocked.
    //
    // The list covers every field whose stored shape differs by encryption
    // mode: text/preview/letter-fields (string ciphertext vs server-hex),
    // doodle strokes (`{encryptedStrokes,e2eeIV}` vs raw stroke array), and
    // photos (`encryptedRef` vs `url`). Anything else (style, spreads,
    // archive flags, scheduling) has the same shape either way and is safe.
    const writesEncryptedField =
      text !== undefined ||
      appendText !== undefined ||
      song !== undefined ||
      doodles !== undefined ||
      newDoodles !== undefined ||
      photos !== undefined ||
      newPhotos !== undefined
    if (writesEncryptedField && existingIsE2EE && !bodyIsE2EE) {
      return NextResponse.json(
        { error: 'E2EE entry — unlock and resend with encryptionType: "e2ee".' },
        { status: 409 },
      )
    }

    const isE2EE = bodyIsE2EE
    const isLetter = existing.entryType !== 'normal'

    // Lock check. Letter drafts in JournalEntry are always unsealed (the JE
    // draft is deleted when the Letter is created at seal time, so a sealed
    // letter never reaches this PUT path). For normal entries: calendar-day
    // → append-only diff allowed.
    const userTz = request.headers.get('x-user-tz') ?? 'UTC'
    const locked = isEntryLocked(existing.createdAt, userTz, {
      entryType: existing.entryType,
      // isSealed was removed from JournalEntry; letter drafts are always
      // editable until the Letter row is created (then the JE is deleted).
      isSealed: false,
    })
    if (locked) {
      if (isLetter) {
        // This branch is only reachable for old-calendar-locked letter drafts;
        // in practice the draft is deleted at seal time before any calendar lock.
        return NextResponse.json(
          { error: 'This letter draft is too old to edit' },
          { status: 403 },
        )
      }
      const decryptedExisting = isE2EE ? { text: existing.text } : decryptEntryFields({ text: existing.text })
      const diff = validateAppendOnlyDiff({
        oldText: decryptedExisting.text,
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

    // Handle text update (for append-only, we'd append to existing)
    if (text !== undefined) {
      const textPreview = !isE2EE ? createPreview(text) : '[Encrypted]'
      updateData.text = isE2EE ? text : encrypt(text)
      updateData.textPreview = isE2EE ? textPreview : encrypt(textPreview)
    }

    // Handle append text (for append-only editing)
    if (appendText) {
      const currentEntry = await prisma.journalEntry.findUnique({
        where: { id },
        select: { text: true },
      })
      if (currentEntry) {
        const decryptedCurrent = isE2EE ? currentEntry.text : decryptEntryFields({ text: currentEntry.text }).text
        const newText = `${decryptedCurrent}<p>${appendText}</p>`
        const textPreview = !isE2EE ? createPreview(newText) : '[Encrypted]'
        updateData.text = isE2EE ? newText : encrypt(newText)
        updateData.textPreview = isE2EE ? textPreview : encrypt(textPreview)
      }
    }

    if (style !== undefined) {
      updateData.style = parseStyle(style)
    }
    if (song !== undefined) updateData.song = song
    if (tags !== undefined) updateData.tags = tags
    if (spreads !== undefined) updateData.spreads = spreads
    if (encryptionType !== undefined) updateData.encryptionType = encryptionType
    if (e2eeIV !== undefined) updateData.e2eeIV = e2eeIV
    // Clear legacy e2eeIV when transitioning from server to e2ee encryption
    if (encryptionType === 'e2ee' && existing.encryptionType === 'server') {
      updateData.e2eeIV = null
    }
    if (e2eeIVs !== undefined) updateData.e2eeIVs = e2eeIVs

    // Letter-draft field. entryType marks the JE as a letter draft ('letter'
    // or 'unsent_letter') so the draft list and compose resume can identify it.
    // The detail fields (recipientEmail, recipientName, senderName,
    // letterLocation, unlockDate) are no longer stored on JournalEntry — they
    // are passed directly at seal time and persisted on the Letter row.
    if (entryType !== undefined) updateData.entryType = entryType

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

    const responseIsE2EE = updatedEntry?.encryptionType === 'e2ee'
    const decryptedEntry = responseIsE2EE ? updatedEntry : decryptEntryFields(updatedEntry!)
    return NextResponse.json({
      ...decryptedEntry,
      encryptionType: updatedEntry?.encryptionType,
      e2eeIV: updatedEntry?.e2eeIV,
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
