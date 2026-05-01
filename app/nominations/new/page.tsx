import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import {
  getAllActiveEmployees,
  isManager,
} from '@/modules/employees/service'
import { VALUES } from '@/modules/values/constants'
import { NominationForm } from '@/components/forms/NominationForm'
import { PeerRecognitionForm } from '@/components/forms/PeerRecognitionForm'
import { PageHeader } from '@/components/ui/PageHeader'

export const dynamic = 'force-dynamic'

// Two recognition kinds share this entry route:
//   - peer    (default): non-monetary, instant, no approval. Available
//                        to everyone.
//   - tiered  (?kind=tiered): the existing T1/T2/T3 reward flow. Only
//                             surfaced to managers — the URL falls
//                             back to peer for ICs.
//
// One URL keeps the AppHeader "+Recognize" pill stable for everyone;
// managers see a kind toggle at the top, ICs just see the peer form.
export default async function NewNominationPage({
  searchParams,
}: {
  // ?nominee=emp_xxx deep-links from the /dashboard/team "Recognize"
  // buttons so the form opens with that teammate pre-selected.
  // ?kind=tiered selects the reward flow for managers.
  searchParams?: { nominee?: string; kind?: string }
}) {
  const session = await auth()
  if (!session?.user?.employeeId) redirect('/auth/signin')
  const currentEmployeeId = session.user.employeeId

  const employees = (await getAllActiveEmployees())
    .filter((e) => e.id !== currentEmployeeId)
    .map((e) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      role_title: e.role_title,
      manager_id: e.manager_id,
    }))

  const initialNomineeId =
    typeof searchParams?.nominee === 'string' ? searchParams.nominee : undefined

  const userIsManager = await isManager(currentEmployeeId)
  // Tiered is manager-only; ICs requesting ?kind=tiered fall back to
  // peer rather than getting a forbidden page.
  const kind: 'peer' | 'tiered' =
    searchParams?.kind === 'tiered' && userIsManager ? 'tiered' : 'peer'

  const valueOptions = VALUES.map((v) => ({
    id: v.id,
    name: v.name,
    behavior_placeholder: v.behavior_placeholder,
    description: shortDescription(v.description),
  }))

  if (kind === 'tiered') {
    return (
      <main className="mx-auto max-w-content px-6 py-10 lg:py-16">
        <PageHeader
          back={{ href: '/dashboard', label: 'Dashboard' }}
          eyebrow="Recognition · with reward"
          title="Recognize a teammate"
          description="Every nomination is an observation of a Novo value being lived. Keep it specific. The smallest acknowledgment is the one most often skipped."
        />

        {userIsManager && <KindToggle current="tiered" nomineeId={initialNomineeId} />}

        <NominationForm
          employees={employees}
          values={valueOptions}
          currentEmployeeId={currentEmployeeId}
          initialNomineeId={initialNomineeId}
        />
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-content px-6 py-10 lg:py-16">
      <PageHeader
        back={{ href: '/dashboard', label: 'Dashboard' }}
        eyebrow="Peer recognition"
        title="Recognize a peer"
        description="A short public acknowledgment for someone who lived a Novo value. No approval, no reward — just visible appreciation. Posts immediately."
      />

      {userIsManager && <KindToggle current="peer" nomineeId={initialNomineeId} />}

      <PeerRecognitionForm
        employees={employees}
        values={valueOptions}
        initialNomineeId={initialNomineeId}
      />
    </main>
  )
}

function KindToggle({
  current,
  nomineeId,
}: {
  current: 'peer' | 'tiered'
  nomineeId?: string
}) {
  const peerHref = nomineeId
    ? `/nominations/new?nominee=${encodeURIComponent(nomineeId)}`
    : '/nominations/new'
  const tieredHref = nomineeId
    ? `/nominations/new?kind=tiered&nominee=${encodeURIComponent(nomineeId)}`
    : '/nominations/new?kind=tiered'
  const cellBase =
    'flex flex-1 flex-col gap-1 rounded-md px-4 py-3 text-left transition'
  return (
    <div
      role="tablist"
      aria-label="Recognition kind"
      className="mb-8 flex gap-2 rounded-lg border border-novo-border bg-novo-hover/40 p-1.5"
    >
      <Link
        role="tab"
        aria-selected={current === 'peer'}
        href={peerHref}
        className={`${cellBase} ${
          current === 'peer'
            ? 'bg-novo-paper text-novo-ink shadow-card'
            : 'text-novo-subtle hover:text-novo-ink'
        }`}
      >
        <span className="text-sm font-semibold">Peer recognition</span>
        <span className="text-xs text-novo-subtle">
          Acknowledge what they did.
        </span>
      </Link>
      <Link
        role="tab"
        aria-selected={current === 'tiered'}
        href={tieredHref}
        className={`${cellBase} ${
          current === 'tiered'
            ? 'bg-novo-paper text-novo-ink shadow-card'
            : 'text-novo-subtle hover:text-novo-ink'
        }`}
      >
        <span className="text-sm font-semibold">With a reward</span>
        <span className="text-xs text-novo-subtle">
          When the moment deserves something tangible.
        </span>
      </Link>
    </div>
  )
}

// VALUES.description is a paragraph; card UI wants a taut single line. Take
// the first sentence and drop trailing clause-joiners so it reads cleanly.
function shortDescription(raw: string): string {
  const firstSentence = raw.split(/\.\s/)[0].trim()
  return firstSentence.endsWith('.') ? firstSentence : `${firstSentence}.`
}
