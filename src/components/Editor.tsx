'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { useEffect, useMemo, useRef } from 'react'
import { useThemeStore } from '@/store/theme'
import { useJournalStore } from '@/store/journal'

interface EditorProps {
  prompt: string
  value?: string
  onChange?: (value: string) => void
  flexible?: boolean // When true, editor fills its parent container instead of fixed 60vh
  customStyles?: React.CSSProperties // Custom styles for the EditorContent element
  bare?: boolean // When true, strips notebook chrome for use in postcard UI
  noScroll?: boolean // When true, disables scrolling (clips overflow)
  maxChars?: number // When set, hard-caps text input at this many characters
  onCharCountChange?: (count: number) => void // Fires whenever the live character count changes
}

export default function Editor({ prompt, value, onChange, flexible, customStyles, bare, noScroll, maxChars, onCharCountChange }: EditorProps) {
  // Use controlled mode if value/onChange provided, otherwise use global store
  const { currentText: storeText, setCurrentText: setStoreText } = useJournalStore()
  const currentText = value !== undefined ? value : storeText
  const setCurrentText = onChange || setStoreText
  const { theme } = useThemeStore()

  // TipTap's `onUpdate` callback is captured at editor-construction time and
  // is never re-bound. If `setCurrentText` (or `onCharCountChange`) changes
  // identity on a parent re-render, the editor would keep calling the OLD
  // version and silently lose live edits. Mirror the latest callbacks into
  // refs and read from them inside the stable onUpdate closure.
  const setCurrentTextRef = useRef(setCurrentText)
  const onCharCountChangeRef = useRef(onCharCountChange)
  useEffect(() => {
    setCurrentTextRef.current = setCurrentText
  }, [setCurrentText])
  useEffect(() => {
    onCharCountChangeRef.current = onCharCountChange
  }, [onCharCountChange])

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: prompt || 'Write freely...',
      }),
      ...(typeof maxChars === 'number' ? [CharacterCount.configure({ limit: maxChars })] : []),
    ],
    // Prompt updates flow through the separate effect below; rebuilding extensions on every
    // prompt change would re-mount the editor and lose focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxChars],
  )

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: currentText,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      setCurrentTextRef.current(editor.getHTML())
      onCharCountChangeRef.current?.(
        editor.storage.characterCount?.characters() ?? 0,
      )
    },
  })

  // Update placeholder when prompt changes
  useEffect(() => {
    if (editor) {
      editor.extensionManager.extensions
        .filter((ext) => ext.name === 'placeholder')
        .forEach((ext) => {
          (ext.options as { placeholder: string }).placeholder = prompt
          editor.view.dispatch(editor.state.tr)
        })
    }
  }, [editor, prompt])

  // Sync editor content when currentText changes externally (reset or edit load)
  useEffect(() => {
    if (editor && currentText !== editor.getHTML()) {
      if (currentText === '' || currentText === '<p></p>') {
        editor.commands.clearContent()
      } else {
        // Load content for editing
        editor.commands.setContent(currentText)
      }
      if (onCharCountChange) {
        onCharCountChange(editor.storage.characterCount?.characters() ?? 0)
      }
    }
    // onCharCountChange is intentionally omitted — emitting on its identity change would
    // double-fire whenever the parent re-renders without the content actually changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, currentText])

  // Emit the initial character count once the editor is ready so the parent has a starting value
  // before the user types anything (e.g. when editing an existing entry).
  useEffect(() => {
    if (editor && onCharCountChange) {
      onCharCountChange(editor.storage.characterCount?.characters() ?? 0)
    }
    // Intentionally fire only on editor creation, not on every onCharCountChange identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // Line height in pixels — must match EditorContent lineHeight (20px font * 2 = 40px)
  const lineHeight = 40

  // Merge default and custom styles for EditorContent
  const editorContentStyle: React.CSSProperties = {
    fontFamily: 'var(--font-caveat), cursive',
    fontSize: '20px',
    lineHeight: 2,
    color: theme.text.primary,
    ...(customStyles || {}),
  }

  return (
    <div
      className={`${bare ? 'relative' : 'rounded-2xl overflow-hidden relative'} ${flexible ? 'flex-1 min-h-0 flex flex-col' : ''}`}
      style={bare ? undefined : {
        background: `linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%), linear-gradient(180deg, ${theme.accent.warm}15 0%, ${theme.accent.warm}08 100%), ${theme.glass.bg}`,
        backdropFilter: `blur(${theme.glass.blur})`,
        border: `1px solid rgba(255,255,255,0.08)`,
        boxShadow: `
          0 8px 32px -4px rgba(0, 0, 0, 0.4),
          0 0 0 1px ${theme.accent.warm}15,
          inset 0 0 80px -10px ${theme.accent.warm}18,
          inset 0 1px 0 0 rgba(255, 255, 255, 0.08)
        `,
      }}
    >
      {/* Date header */}
      {!bare && (
      <div
        className={`text-right pt-3 pr-6 ${flexible ? 'shrink-0' : ''}`}
        style={{
          fontFamily: 'var(--font-caveat), cursive',
          fontSize: '16px',
          color: theme.text.muted,
          letterSpacing: '0.5px',
        }}
      >
        {new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </div>
      )}

      {/* Notebook spine/binding effect */}
      {!bare && (
      <div
        className="absolute left-0 top-0 bottom-0 w-3"
        style={{
          background: `linear-gradient(to right,
            ${theme.accent.warm}15 0%,
            ${theme.accent.warm}08 50%,
            transparent 100%
          )`,
          borderRight: `1px solid ${theme.accent.warm}20`,
        }}
      />
      )}

      {/* Left margin line (classic red/warm line) — full height */}
      {!bare && (
      <div
        className="absolute top-0 bottom-0 w-px"
        style={{
          left: '48px',
          background: `${theme.accent.warm}55`,
          zIndex: 1,
        }}
      />
      )}

      {/* Main content area */}
      <div className={`relative ${flexible ? 'flex-1 min-h-0 flex flex-col' : ''}`}>

        {/* Ruled lines background */}
        {!bare && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            left: '48px',
            backgroundImage: `repeating-linear-gradient(
              to bottom,
              transparent 0px,
              transparent ${lineHeight - 1}px,
              ${theme.text.muted}30 ${lineHeight - 1}px,
              ${theme.text.muted}30 ${lineHeight}px
            )`,
            backgroundPosition: '0 24px',
          }}
        />
        )}

        {/* Editor wrapper with padding for margin */}
        <div
          className={`${noScroll ? 'overflow-hidden' : 'overflow-y-auto'} relative ${flexible ? 'flex-1 min-h-0' : ''}`}
          style={bare ? {
            height: flexible ? undefined : '60vh',
            padding: '12px',
          } : {
            height: flexible ? undefined : '60vh',
            paddingLeft: '56px',
            paddingRight: '24px',
            paddingTop: '24px',
            paddingBottom: '24px',
          }}
        >
          <EditorContent
            editor={editor}
            style={editorContentStyle}
          />
        </div>
      </div>

      {/* Subtle paper texture overlay */}
      {!bare && (
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
      )}

      <style jsx global>{`
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: ${theme.text.muted};
          font-style: italic;
          pointer-events: none;
          float: left;
          height: 0;
        }
        .ProseMirror:focus {
          outline: none;
        }
        .ProseMirror .ProseMirror-cursor,
        .ProseMirror > .ProseMirror-separator + .ProseMirror-trailingBreak {
          transform: rotate(8deg);
        }
        .ProseMirror {
          caret-color: ${theme.accent.warm};
        }
        .ProseMirror p {
          margin-bottom: 0;
          padding-bottom: 0;
          line-height: 40px;
        }
        .ProseMirror h1 {
          font-size: 1.5em;
          font-weight: 600;
          color: ${theme.text.primary};
          line-height: 2;
        }
        .ProseMirror h2 {
          font-size: 1.25em;
          font-weight: 600;
          color: ${theme.text.primary};
          line-height: 2;
        }
        .ProseMirror blockquote {
          border-left: 3px solid ${theme.accent.primary};
          padding-left: 1em;
          margin-left: 0;
          color: ${theme.text.secondary};
          font-style: italic;
        }
        .ProseMirror strong {
          color: ${theme.accent.warm};
        }
        .ProseMirror em {
          color: ${theme.text.secondary};
        }
      `}</style>
    </div>
  )
}
