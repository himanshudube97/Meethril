'use client'

interface PasswordToggleProps {
  /** Whether the field is currently revealed (text) vs masked (password). */
  shown: boolean
  onToggle: () => void
  /** Icon colour — pass the surrounding theme's muted text colour. */
  color?: string
}

/**
 * Eye / eye-off button that reveals a masked password/key field. Absolutely
 * positioned inside a `relative` wrapper at the input's right edge — give the
 * input `paddingRight: ~2.75rem` so the text never slides under the icon.
 * tabIndex -1 keeps it out of the form's tab order.
 */
export function PasswordToggle({ shown, onToggle, color }: PasswordToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      tabIndex={-1}
      aria-label={shown ? 'Hide' : 'Show'}
      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 opacity-55 hover:opacity-100 transition-opacity focus:outline-none"
      style={{ color: color ?? 'currentColor', background: 'transparent', border: 'none', cursor: 'pointer' }}
    >
      {shown ? (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3l18 18" />
          <path d="M10.58 10.58a2 2 0 002.83 2.83" />
          <path d="M9.36 5.18A9.46 9.46 0 0112 5c4.64 0 8.58 3.06 9.9 7a10.7 10.7 0 01-2.07 3.4M6.1 6.1A10.75 10.75 0 002.1 12c1.32 3.94 5.26 7 9.9 7a9.5 9.5 0 003.9-.83" />
        </svg>
      ) : (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.1 12C3.42 8.06 7.36 5 12 5s8.58 3.06 9.9 7c-1.32 3.94-5.26 7-9.9 7s-8.58-3.06-9.9-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  )
}
