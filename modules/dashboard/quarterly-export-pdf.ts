import PDFDocument from 'pdfkit'
import { tierLabel } from '@/modules/nominations/types'
import type {
  TeamRecognitionsForQuarter,
  TeamRecognitionGroup,
  TeamRecognitionItem,
  Quarter,
} from './team-recognitions-view'

// Renders a TeamRecognitionsForQuarter into a PDF buffer using pdfkit.
// Plain black-on-white, Helvetica throughout, two type sizes (header vs
// body). Header on page 1 (two lines), footer on every page. No summary,
// no counts, no totals — just recognitions grouped by recipient. Value
// tags render as plain bracketed text per spec; no colour.

const PAGE_MARGIN = 56 // ~0.78"
const FOOTER_OFFSET_FROM_BOTTOM = 36

export async function renderQuarterlyExportPDF(
  data: TeamRecognitionsForQuarter,
  generatedAt: Date = new Date()
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: PAGE_MARGIN,
      // bufferPages keeps every page in memory until end() so we can
      // stamp the footer onto each page after the body has paginated
      // naturally.
      bufferPages: true,
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    drawHeader(doc, data)
    drawBody(doc, data)
    drawFooterOnEveryPage(doc, generatedAt)

    doc.end()
  })
}

function drawHeader(
  doc: InstanceType<typeof PDFDocument>,
  data: TeamRecognitionsForQuarter
) {
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor('#000000')
    .text(`Recognition for ${data.manager_name}'s team`)
  doc
    .moveDown(0.2)
    .font('Helvetica')
    .fontSize(12)
    .fillColor('#000000')
    .text(`${quarterLabel(data.quarter)} ${data.year}`)
  doc.moveDown(1.5)
}

function drawBody(
  doc: InstanceType<typeof PDFDocument>,
  data: TeamRecognitionsForQuarter
) {
  // Empty case: only the header + footer render. The page already
  // suppresses the export button when there's nothing to export, so
  // this is mostly a defensive path; a manual hit on /export would
  // produce a header-only PDF.
  if (data.groups.length === 0) return

  data.groups.forEach((group, index) => {
    drawGroup(doc, group)
    if (index < data.groups.length - 1) {
      doc.moveDown(1)
    }
  })
}

function drawGroup(
  doc: InstanceType<typeof PDFDocument>,
  group: TeamRecognitionGroup
) {
  // Section header: name + role on the same column, role muted.
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#000000')
    .text(group.recipient.name)
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#555555')
    .text(group.recipient.role_title)
  doc.moveDown(0.5)

  for (const r of group.recognitions) {
    drawRecognition(doc, r, group.recipient.name)
  }
}

function drawRecognition(
  doc: InstanceType<typeof PDFDocument>,
  r: TeamRecognitionItem,
  recipientName: string
) {
  // Meta line: date · [Value] · giver → recipient · tier. Light grey,
  // small. Plain bracketed value tag per spec — no colour.
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#555555')
    .text(
      `${formatDate(r.date)}  ·  [${r.value_name}]  ·  ${r.giver_name} → ${recipientName}  ·  ${tierLabel(r.current_tier)}`
    )
  // Narrative — black, body size, quoted to match the in-app convention.
  doc.font('Helvetica').fontSize(11).fillColor('#000000').text(`"${r.behavior_text}"`)
  if (r.outcome_text.trim().length > 0) {
    doc.text(r.outcome_text)
  }
  doc.moveDown(0.6)
}

function drawFooterOnEveryPage(
  doc: InstanceType<typeof PDFDocument>,
  generatedAt: Date
) {
  const footer = `Generated ${formatDate(generatedAt)} from Novo Rewards.`
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    const y = doc.page.height - FOOTER_OFFSET_FROM_BOTTOM
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#777777')
      .text(footer, PAGE_MARGIN, y, {
        // lineBreak:false guards against pdfkit auto-paginating if the
        // footer ever pushed past the visible page area.
        lineBreak: false,
        width: doc.page.width - PAGE_MARGIN * 2,
        align: 'left',
      })
  }
}

function quarterLabel(q: Quarter): string {
  return `Q${q}`
}

function formatDate(d: Date): string {
  // Manager-friendly, locale-stable: "May 1, 2026"
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
