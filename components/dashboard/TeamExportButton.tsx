import { Button, LinkButton } from '@/components/ui/Button'

// Top-right action on /dashboard/team. When the page has at least one
// recognition to export, this is a regular link to the PDF route.
// Otherwise it renders as a disabled <button> with a native title
// tooltip per spec — no explanatory body copy on the page.
export function TeamExportButton({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      <LinkButton
        href="/dashboard/team/export"
        variant="secondary"
        size="sm"
      >
        Export this quarter (PDF)
      </LinkButton>
    )
  }
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled
      title="Nothing to export yet."
      aria-disabled
    >
      Export this quarter (PDF)
    </Button>
  )
}
