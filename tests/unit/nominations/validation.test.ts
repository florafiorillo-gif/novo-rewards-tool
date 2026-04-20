/** @jest-environment node */
import { NominationInputSchema } from '@/modules/nominations/schema'

const validInput = {
  nominee_id: 'emp_006',
  value_id: 'val_run_for_the_bus',
  behavior_text: 'a'.repeat(40),
  outcome_text: 'b'.repeat(40),
  evidence_links: ['https://example.com/pr/1'],
}

describe('NominationInputSchema (spec §6.2)', () => {
  it('accepts a well-formed submission', () => {
    const result = NominationInputSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('rejects behavior_text shorter than 30 characters', () => {
    const result = NominationInputSchema.safeParse({ ...validInput, behavior_text: 'too short' })
    expect(result.success).toBe(false)
  })

  it('rejects behavior_text longer than 500 characters', () => {
    const result = NominationInputSchema.safeParse({
      ...validInput,
      behavior_text: 'a'.repeat(501),
    })
    expect(result.success).toBe(false)
  })

  it('rejects outcome_text shorter than 30 characters', () => {
    const result = NominationInputSchema.safeParse({ ...validInput, outcome_text: 'nope' })
    expect(result.success).toBe(false)
  })

  it('rejects more than three evidence links', () => {
    const result = NominationInputSchema.safeParse({
      ...validInput,
      evidence_links: [
        'https://a.example',
        'https://b.example',
        'https://c.example',
        'https://d.example',
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-URL evidence links', () => {
    const result = NominationInputSchema.safeParse({
      ...validInput,
      evidence_links: ['not-a-url'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects a value_id outside the four-value allowlist', () => {
    const result = NominationInputSchema.safeParse({ ...validInput, value_id: 'val_made_up' })
    expect(result.success).toBe(false)
  })

  it('allows the evidence_links array to be omitted', () => {
    const { evidence_links, ...noEvidence } = validInput
    const result = NominationInputSchema.safeParse(noEvidence)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.evidence_links).toEqual([])
  })

  it('trims surrounding whitespace on text fields before length check', () => {
    const result = NominationInputSchema.safeParse({
      ...validInput,
      behavior_text: '   ' + 'a'.repeat(20) + '   ',
    })
    expect(result.success).toBe(false)
  })
})
