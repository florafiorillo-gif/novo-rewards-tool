import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { isManager } from '@/modules/employees/service'
import {
  getTeamRecognitionsForQuarter,
  managerLastNameSlug,
} from '@/modules/dashboard/team-recognitions-view'
import { renderQuarterlyExportPDF } from '@/modules/dashboard/quarterly-export-pdf'

// GET /dashboard/team/export
// Streams a PDF of the current calendar quarter's recognitions for the
// signed-in manager's direct reports. No date picker — quarter is derived
// from the server's current date.

export const dynamic = 'force-dynamic'
// pdfkit reads built-in font .afm files from disk at runtime, so this
// must run on the Node runtime, not the edge runtime.
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) {
    return NextResponse.redirect(new URL('/auth/signin', req.url))
  }
  if (!(await isManager(employeeId))) {
    return new NextResponse('Not found', { status: 404 })
  }

  const data = await getTeamRecognitionsForQuarter(employeeId)
  const buffer = await renderQuarterlyExportPDF(data)
  const filename = `novo-recognition-${managerLastNameSlug(data.manager_name)}-q${data.quarter}-${data.year}.pdf`

  // Wrap in a fresh Uint8Array view so the BodyInit type is satisfied —
  // Node's Buffer is structurally a Uint8Array but TS no longer accepts
  // it directly as a Web Response body.
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
