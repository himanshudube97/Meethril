// Pool of one-line poetic reminders for the nightly push notification.
// Each line should be ≤100 chars so it renders cleanly across OSes without truncation.
// Author the rest of the pool over time; v1 ships with these 5.
export const REMINDER_LINES: readonly string[] = [
  'the evening is quiet. write a line.',
  'hearth is here. one small thing?',
  'before sleep, a sentence about today.',
  'no pressure. just a page that\'s waiting.',
  'the day\'s still warm. tell us how it felt.',
] as const

export function pickReminderLine(): string {
  return REMINDER_LINES[Math.floor(Math.random() * REMINDER_LINES.length)]
}

export const REMINDER_TITLE = 'meethril'
