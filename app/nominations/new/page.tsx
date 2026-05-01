import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getAllActiveEmployees } from '@/modules/employees/service'
import { resolveRole } from '@/modules/roles/resolver'
import { activeViews, parseViewParam } from '@/modules/dashboard/views'
import { VALUES } from '@/modules/values/constants'
import { NominationForm } from '@/components/forms/NominationForm'
import { PeerRecognitionForm } from '@/components/forms/PeerRecognitionForm'
import { PageHeader } from '@/components/ui/PageHeader'
import { KeepViewLink } from '@/components/layout/KeepViewLink'

export const dynamic = 'force-dynamic'

// Two recognition kinds share this entry route:
//   - peer    (default): non-monetary, instant, no approval. Available
//                        to everyone.
//   - tiered  (?kind=tiered): the existing T1/T2/T3 reward flow. Only
//                             surfaced when the viewer's *active* view
//                             includes 'manager' — i.e., a real manager
//                             outside of sim, or any viewer simulating
//                             Manager. ICs (and managers simulating
//                             Employee) see the peer form only.
//
// Submission-time authorization still gates on the viewer's *real* role
// inside the server actions, per modules/dashboard/views.ts — the
// active-view gate here is purely a visibility / fallback rule.
//
// One URL keeps the AppHeader "+Recognize" pill stable for everyone;
// managers (or sim-as-Manager) see a kind toggle at the top, the
// Employee flow just shows the peer form.
export default async function NewNominationPage({
  searchParams,
}: {
  // ?nominee=emp_xxx deep-links from inline "Recognize" buttons so the
  // form opens with that teammate pre-selected.
  // ?kind=tiered selects the reward flow when the active view permits.
  // ?view=employee|manager|... is the demo view-switcher state.
  searchParams?: { nominee?: string; kind?: string; view?: string }
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

  const role = await resolveRole(currentEmployeeId)
  const simulated = parseViewParam(searchParams?.view)
  const views = activeViews(role, simulated)
  // Tiered is gated on the *active* view including 'manager'. A real
  // Manager simulating Employee sees peer only; a real Employee
  // simulating Manager sees both options (server-side actions still
  // enforce real-role permissions on submit).
  const showTiered = views.has('manager')
  const kind: 'peer' | 'tiered' =
    searchParams?.kind === 'tiered' && showTiered ? 'tiered' : 'peer'

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
          title="Recognize a teammate"
          description="Approval is required before the reward is sent. Be specific."
        />

        {showTiered && <KindToggle current="tiered" nomineeId={initialNomineeId} />}

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
        title="Recognize a peer"
        description="Posts immediately. No approval, no reward."
      />

      {showTiered && <KindToggle current="peer" nomineeId={initialNomineeId} />}

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
      <KeepViewLink
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
      </KeepViewLink>
      <KeepViewLink
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
      </KeepViewLink>
    </div>
  )
}

// VALUES.description is a paragraph; card UI wants a taut single line. Take
// the first sentence and drop trailing clause-joiners so it reads cleanly.
function shortDescription(raw: string): string {
  const firstSentence = raw.split(/\.\s/)[0].trim()
  return firstSentence.endsWith('.') ? firstSentence : `${firstSentence}.`
}
