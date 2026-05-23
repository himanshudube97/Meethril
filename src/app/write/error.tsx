'use client'

import RouteErrorBoundary from '@/components/RouteErrorBoundary'

export default function WriteError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteErrorBoundary {...props} context="your writing desk" />
}
