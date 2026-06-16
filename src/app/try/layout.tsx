import TryModeProvider from '@/components/try/TryModeProvider'

export default function TryLayout({ children }: { children: React.ReactNode }) {
  return <TryModeProvider>{children}</TryModeProvider>
}
