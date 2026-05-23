'use client'

import RouteErrorBoundary from '@/components/RouteErrorBoundary'

export default function MemoryError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteErrorBoundary {...props} context="your memories" />
}
