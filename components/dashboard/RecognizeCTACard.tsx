import Link from 'next/link'

// Employee landing CTA. The AppHeader always has a "+ Recognize" pill,
// but for individual contributors without an admin or manager queue
// competing for attention, the landing should have its own dedicated
// surface for the primary action. Ink background matches the "Waiting
// on you" weighty card for managers — so the inverted-card slot is
// consistent per role.
export function RecognizeCTACard() {
  return (
    <section className="rounded-lg border border-novo-ink bg-novo-ink p-5 text-novo-paper shadow-elevated">
      <p className="text-2xs font-medium uppercase tracking-[0.08em] text-white/60">
        Recognize a teammate
      </p>
      <p className="mt-2 text-lg font-semibold leading-snug">
        Someone doing something worth calling out?
      </p>
      <p className="mt-1 text-xs leading-relaxed text-white/70">
        Tell the story behind the behavior — what they did, what it moved.
      </p>
      <Link
        href="/nominations/new"
        className="mt-4 inline-flex h-8 items-center rounded-md bg-white px-3 text-xs font-medium text-novo-ink hover:bg-white/90"
      >
        Write a recognition <span aria-hidden className="ml-1">→</span>
      </Link>
    </section>
  )
}
