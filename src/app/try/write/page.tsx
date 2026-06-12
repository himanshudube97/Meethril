import TryModeProvider from '@/components/try/TryModeProvider'
import DeskScene from '@/components/desk/DeskScene'
import TryInvite from '@/components/try/TryInvite'

export default function TryWritePage() {
  return (
    <TryModeProvider>
      <DeskScene />
      <TryInvite />
    </TryModeProvider>
  )
}
