// Browser helpers that hand the user a downloadable .txt copy of their
// E2EE keys. Triggered automatically after setup and after either key
// rotates so the user always has a fresh local backup. The user can
// delete the file — it's a memo, not a security boundary.

function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function todaySuffix(): string {
  return new Date().toISOString().slice(0, 10)
}

function formattedDate(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export function downloadDailyKeyFile(passphrase: string, accountEmail?: string) {
  const accountLine = accountEmail ? `Account: ${accountEmail}\n` : ''
  const body = `MEETHRIL DAILY KEY
======================

${accountLine}Generated: ${formattedDate()}

Daily Key:

    ${passphrase}

You'll be asked for this every time you unlock your journal on a
device that hasn't been "trusted." Keep this file somewhere safe.

If you lose both your daily key and your recovery key,
your encrypted journal cannot be recovered.
`
  triggerDownload(`meethril-daily-key-${todaySuffix()}.txt`, body)
}

export function downloadRecoveryKeyFile(recoveryKey: string, accountEmail?: string) {
  const accountLine = accountEmail ? `Account: ${accountEmail}\n` : ''
  const body = `MEETHRIL RECOVERY KEY
======================

${accountLine}Generated: ${formattedDate()}

Recovery Key:

    ${recoveryKey}

To recover access:
  1. Open Meethril → "Forgot daily key? Use recovery key"
  2. Enter the key above
  3. Set a new daily key

Either key can rotate the other. If you regenerate one, regenerate
the other on the same device while you're still unlocked.

If you lose both your daily key and this recovery key,
your encrypted journal cannot be recovered.
`
  triggerDownload(`meethril-recovery-key-${todaySuffix()}.txt`, body)
}
