import { Resend } from 'resend'

let _resend: Resend | null = null
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}


// Generate beautiful HTML email for letter delivery
function generateLetterEmail({
  recipientName,
  senderName,
  letterContent,
  letterLocation,
  writtenAt,
  photos,
  doodleDataUrl,
  songLink,
}: {
  recipientName: string
  senderName: string
  letterContent: string
  letterLocation?: string | null
  writtenAt: Date
  photos?: { url: string; position: number }[]
  doodleDataUrl?: string | null
  songLink?: string | null
}): string {
  const formattedDate = writtenAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // Strip HTML tags for plain text sections but keep formatting for the main content
  const cleanContent = letterContent
    .replace(/<p><\/p>/g, '<br/>')
    .replace(/<p>/g, '')
    .replace(/<\/p>/g, '<br/>')

  // Build photos HTML
  const photosHtml = photos && photos.length > 0
    ? `
              <!-- Photos Section -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 0 32px 24px 32px; text-align: center;">
                    <div style="text-align: center; margin-top: 24px;">
                      ${photos.map((photo) => {
                        const rotation = photo.position === 1 ? 7 : -7
                        return `<div style="display: inline-block; padding: 6px 6px 20px 6px; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.2); margin: 0 8px; transform: rotate(${rotation}deg);">
                        <img src="${photo.url}" style="width: 120px; height: 150px; object-fit: cover;" alt="" />
                      </div>`
                      }).join('\n                      ')}
                    </div>
                  </td>
                </tr>
              </table>`
    : ''

  // Build doodle HTML
  const doodleHtml = doodleDataUrl
    ? `
              <!-- Doodle Section -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 0 32px 24px 32px; text-align: center;">
                    <div style="text-align: center; margin-top: 24px;">
                      <img src="${doodleDataUrl}" style="max-width: 300px; width: 100%; border-radius: 12px;" alt="A hand-drawn doodle" />
                    </div>
                  </td>
                </tr>
              </table>`
    : ''

  // Build music HTML
  const musicHtml = songLink
    ? `
              <!-- Music Section -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 0 32px 24px 32px;">
                    <div style="margin-top: 24px; padding: 12px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(232,148,90,0.3); border-radius: 12px;">
                      <table cellpadding="0" cellspacing="0" border="0" width="100%">
                        <tr>
                          <td style="width: 36px; font-size: 24px; vertical-align: middle;">&#127925;</td>
                          <td style="padding-left: 12px;">
                            <div style="font-family: 'Inter', sans-serif; font-size: 13px; color: rgba(232,148,90,0.8);">A song was shared with this letter</div>
                            <a href="${songLink}" style="font-family: 'Inter', sans-serif; font-size: 14px; color: #e8945a; text-decoration: none; word-break: break-all;">${songLink}</a>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>
              </table>`
    : ''

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>A Letter From ${senderName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #1a1215; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #1a1215; min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 20px;">

        <!-- Header -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px;">
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <div style="font-size: 32px; margin-bottom: 8px;">✨</div>
              <h1 style="color: #f5e6d3; font-size: 24px; font-weight: 300; margin: 0; letter-spacing: 0.5px;">
                A letter has arrived
              </h1>
              <p style="color: #9a7b5b; font-size: 14px; margin: 8px 0 0 0;">
                Written ${letterLocation ? `from ${letterLocation}, ` : ''}${formattedDate}
              </p>
            </td>
          </tr>
        </table>

        <!-- Letter Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px;">
          <tr>
            <td style="background: linear-gradient(135deg, rgba(232,148,90,0.15) 0%, rgba(212,168,75,0.08) 100%); border-radius: 16px; border: 1px solid rgba(232,148,90,0.2);">

              <!-- Letter Header -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 24px 32px 16px 32px; border-bottom: 1px solid rgba(232,148,90,0.1);">
                    <p style="color: #9a7b5b; font-size: 14px; margin: 0; font-style: italic;">
                      Dear ${recipientName},
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Letter Content -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 24px 32px;">
                    <div style="color: #f5e6d3; font-family: 'Crimson Pro', Georgia, serif; font-size: 18px; line-height: 2; letter-spacing: 0.3px;">
                      ${cleanContent}
                    </div>
                  </td>
                </tr>
              </table>
${photosHtml}${doodleHtml}${musicHtml}
              <!-- Letter Footer -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 16px 32px 24px 32px; border-top: 1px solid rgba(232,148,90,0.1);">
                    <p style="color: #9a7b5b; font-size: 14px; margin: 0; font-style: italic; text-align: right;">
                      — ${senderName}
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>

        <!-- CTA Section -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px;">
          <tr>
            <td align="center" style="padding: 40px 0 24px 0;">
              <p style="color: #9a7b5b; font-size: 14px; margin: 0 0 16px 0;">
                Want to write a letter back?
              </p>
              <a href="https://hearth.app/letters"
                 style="display: inline-block; background-color: #e8945a; color: #1a1215; padding: 12px 32px; border-radius: 24px; text-decoration: none; font-size: 14px; font-weight: 500;">
                Write a Letter
              </a>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px;">
          <tr>
            <td align="center" style="padding: 24px 0; border-top: 1px solid rgba(154,123,91,0.2);">
              <p style="color: #6b5a4a; font-size: 12px; margin: 0;">
                Sent with warmth from <a href="https://hearth.app" style="color: #e8945a; text-decoration: none;">Hearth</a>
              </p>
              <p style="color: #4a3a2a; font-size: 11px; margin: 8px 0 0 0;">
                Words that travel through time
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>
`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!))
}

// Generate notification email for self-letters
export async function sendSelfLetterNotification({
  to,
  userName,
}: {
  to: string
  userName: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>A Letter From Your Past Self</title>
</head>
<body style="margin: 0; padding: 0; background-color: #1a1215; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #1a1215; min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 20px;">

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px;">
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <div style="font-size: 48px; margin-bottom: 16px;">✨</div>
              <h1 style="color: #f5e6d3; font-size: 24px; font-weight: 300; margin: 0;">
                A letter from the past has arrived
              </h1>
              <p style="color: #9a7b5b; font-size: 16px; margin: 16px 0 0 0; line-height: 1.6;">
                ${userName ? `Dear ${userName}, ` : ''}Your past self wrote you a letter, and it&apos;s ready to be opened.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 24px 0;">
              <a href="https://hearth.app"
                 style="display: inline-block; background-color: #e8945a; color: #1a1215; padding: 14px 40px; border-radius: 24px; text-decoration: none; font-size: 15px; font-weight: 500;">
                Open Your Letter
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 32px 0; border-top: 1px solid rgba(154,123,91,0.2);">
              <p style="color: #6b5a4a; font-size: 12px; margin: 0;">
                Sent with warmth from <a href="https://hearth.app" style="color: #e8945a; text-decoration: none;">Hearth</a>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>
`

    const { error } = await getResend().emails.send({
      from: process.env.RESEND_FROM_LETTERS!,
      to: [to],
      subject: 'A letter from your past self has arrived',
      html,
    })

    if (error) {
      console.error('Failed to send self letter notification:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('Error sending self letter notification:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// Send full letter content email to self (used when self-letter is delivered)
export async function sendSelfLetterEmail({
  to,
  userName,
  letterContent,
  letterLocation,
  writtenAt,
  photos,
  doodleDataUrl,
  songLink,
}: {
  to: string
  userName: string
  letterContent: string
  letterLocation?: string | null
  writtenAt: Date
  photos?: { url: string; position: number }[]
  doodleDataUrl?: string | null
  songLink?: string | null
}): Promise<{ success: boolean; error?: string }> {
  try {
    const html = generateLetterEmail({
      recipientName: userName || 'future me',
      senderName: 'Your past self',
      letterContent,
      letterLocation,
      writtenAt,
      photos,
      doodleDataUrl,
      songLink,
    })

    const { error } = await getResend().emails.send({
      from: process.env.RESEND_FROM_LETTERS!,
      to,
      subject: 'A letter from your past self has arrived',
      html,
    })

    if (error) {
      console.error('Failed to send self letter email:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('Error sending self letter email:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Phase 4 friend-letter transient delivery. Schedules a Resend email at
 * unlockDate with the magic URL. Returns Resend's email id so the
 * webhook can correlate later.
 */
export async function sendFriendLetterTransientEmail(args: {
  to: string
  recipientName: string
  senderName: string
  scheduledFor: Date
  publicToken: string
}): Promise<{ id: string }> {
  const from = process.env.RESEND_FROM_LETTERS
  if (!from) throw new Error('RESEND_FROM_LETTERS not set')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL not set')

  const url = `${appUrl}/letter/${args.publicToken}`
  const safeSender = escapeHtml(args.senderName)
  const safeRecipient = args.recipientName ? escapeHtml(args.recipientName) : null
  const greeting = safeRecipient ? `Hi ${safeRecipient},` : 'Hello,'
  const html = `
    <div style="font-family: Georgia, serif; line-height: 1.6; color: #3d342a;">
      <p>${greeting}</p>
      <p>${safeSender} wrote you a letter and asked us to deliver it today.</p>
      <p>
        <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #3d342a; color: #f6efe2; text-decoration: none; border-radius: 999px;">
          Open your letter
        </a>
      </p>
      <p style="font-size: 13px; opacity: 0.7;">
        The letter is yours for 24 hours after you open it, then it fades.
        Only you can read it — even Hearth's servers cannot.
      </p>
    </div>
  `
  const r = await getResend().emails.send({
    from,
    to: args.to,
    subject: `${args.senderName} sent you a letter`,
    html,
    scheduledAt: args.scheduledFor.toISOString(),
  })
  if (r.error) throw new Error(`Resend error: ${r.error.message}`)
  if (!r.data?.id) throw new Error('Resend returned no email id')
  return { id: r.data.id }
}

export async function sendSelfLetterReminderEmail(args: {
  to: string
  recipientName: string | null
  writtenOn: Date
}): Promise<void> {
  const from = process.env.RESEND_FROM_LETTERS
  if (!from) throw new Error('RESEND_FROM_LETTERS not set')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL not set')

  const writtenStr = args.writtenOn.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const safeRecipient = args.recipientName ? escapeHtml(args.recipientName) : null
  const greeting = safeRecipient ? `Hi ${safeRecipient},` : 'Hello,'
  const html = `
    <div style="font-family: Georgia, serif; line-height: 1.6; color: #3d342a;">
      <p>${greeting}</p>
      <p>A letter you wrote to yourself on ${writtenStr} is ready to be read.</p>
      <p><a href="${appUrl}/letters" style="display:inline-block;padding:12px 24px;background:#3d342a;color:#f6efe2;text-decoration:none;border-radius:999px;">Open Hearth</a></p>
      <p style="font-size: 13px; opacity: 0.7;">Open the app to unlock and read it — your phrase is the key.</p>
    </div>
  `
  const r = await getResend().emails.send({ from, to: args.to, subject: 'Your letter is ready', html })
  if (r.error) throw new Error(`Resend: ${r.error.message}`)
}

export async function sendAskForCopyEmail(args: {
  to: string
  recipientName: string | null
  senderName: string
}): Promise<void> {
  const from = process.env.RESEND_FROM_LETTERS
  if (!from) throw new Error('RESEND_FROM_LETTERS not set')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL not set')

  const safeSender = escapeHtml(args.senderName)
  const safeRecipient = args.recipientName ? escapeHtml(args.recipientName) : null
  const greeting = safeRecipient ? `Hi ${safeRecipient},` : 'Hello,'
  const html = `
    <div style="font-family: Georgia, serif; line-height: 1.6; color: #3d342a;">
      <p>${greeting}</p>
      <p>${safeSender} has been thinking about the letter you saved and would love to read it again.</p>
      <p>If you'd like to send a copy back to them, open Hearth and find the letter in your kept letters.</p>
      <p><a href="${appUrl}/me" style="display:inline-block;padding:12px 24px;background:#3d342a;color:#f6efe2;text-decoration:none;border-radius:999px;">Open Hearth</a></p>
    </div>
  `
  const r = await getResend().emails.send({
    from,
    to: args.to,
    subject: `${args.senderName} is asking about a letter`,
    html,
  })
  if (r.error) throw new Error(`Resend: ${r.error.message}`)
}
