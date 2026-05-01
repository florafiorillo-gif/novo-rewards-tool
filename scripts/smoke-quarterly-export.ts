// Smoke test for the quarterly export pipeline. Picks a manager from the
// mock seed (any employee with at least one direct report), composes the
// export shape, renders a PDF, and writes it to /tmp/. Verifies the byte
// header is %PDF and prints a small summary of the groups.
//
// Run: USE_MOCK_DATA=true npx tsx scripts/smoke-quarterly-export.ts

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

process.env.USE_MOCK_DATA = process.env.USE_MOCK_DATA ?? 'true'

import { insertMock } from '@/modules/nominations/mock-store'
import { buildDemoNominations } from '@/modules/seed/demo-nominations'
import { getAllActiveEmployees } from '@/modules/employees/service'
import {
  getTeamRecognitionsForQuarter,
  managerLastNameSlug,
} from '@/modules/dashboard/team-recognitions-view'
import { renderQuarterlyExportPDF } from '@/modules/dashboard/quarterly-export-pdf'

async function main() {
  // Inline-seed the nominations store so we don't race the async
  // demo-bootstrap path. Mirrors what app/layout.tsx triggers in dev.
  const seededNominations = buildDemoNominations()
  for (const nom of seededNominations) {
    insertMock(nom)
  }

  const employees = await getAllActiveEmployees()
  const empById = new Map(employees.map((e) => [e.id, e]))

  // Prefer a manager whose reports actually have recognitions in Q2 2026
  // (the seed window) so we hit the populated render path. Fall through
  // to the empty-render path if every test manager came up empty.
  const recognizedReportIds = new Set(seededNominations.map((n) => n.nominee_id))
  const recognizedManagerScore = new Map<string, number>()
  for (const e of employees) {
    if (!e.manager_id) continue
    if (recognizedReportIds.has(e.id)) {
      recognizedManagerScore.set(
        e.manager_id,
        (recognizedManagerScore.get(e.manager_id) ?? 0) + 1
      )
    }
  }
  const managerId =
    Array.from(recognizedManagerScore.entries()).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0] ??
    employees.find((e) => e.manager_id)?.manager_id ??
    null
  if (!managerId) {
    console.error('No manager found in mock seed.')
    process.exit(1)
  }

  const data = await getTeamRecognitionsForQuarter(managerId)
  const manager = empById.get(managerId)
  console.log(
    `Manager: ${manager?.name ?? data.manager_name} (${managerId}) · Q${data.quarter} ${data.year}`
  )
  console.log(`Groups: ${data.groups.length}`)
  for (const g of data.groups) {
    console.log(
      `  • ${g.recipient.name} (${g.recipient.role_title}) — ${g.recognitions.length} recognitions`
    )
    for (const r of g.recognitions.slice(0, 3)) {
      console.log(
        `      · ${r.tier_label} · ${r.value_name} · ${r.giver_name} · ${r.date.toISOString().slice(0, 10)}`
      )
    }
  }

  const buffer = await renderQuarterlyExportPDF(data)
  if (buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
    console.error(
      `PDF header mismatch — got ${buffer.subarray(0, 8).toString('ascii')}`
    )
    process.exit(1)
  }

  const filename = `novo-recognition-${managerLastNameSlug(data.manager_name)}-q${data.quarter}-${data.year}.pdf`
  const out = join(tmpdir(), filename)
  writeFileSync(out, buffer)
  console.log(`PDF (${buffer.length} bytes) → ${out}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
