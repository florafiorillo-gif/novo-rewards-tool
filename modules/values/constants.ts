// Single source of truth for the four values (spec §4). Seed imports from here.
// Stored in the DB as rows in the Value table; these IDs are stable across environments.

export interface ValueDef {
  id: string
  name: string
  description: string
  // Placeholder shown in the Slack/web nomination modal's behavior_text field.
  // Adjusts per value (spec §6.2).
  behavior_placeholder: string
}

export const VALUES: ValueDef[] = [
  {
    id: 'val_run_for_the_bus',
    name: 'Run for the Bus',
    description:
      'Bias to action. If it advances a company goal or customer need, move. Do not wait for permission when you have the information to act.',
    behavior_placeholder:
      "e.g., shipped the migration over the weekend without waiting for the usual review cycle",
  },
  {
    id: 'val_hierarchy_not_authority',
    name: 'Hierarchy Is Not Authority',
    description:
      'The best idea wins regardless of who says it. Leaders are comfortable following when someone else has the better answer.',
    behavior_placeholder:
      "e.g., pushed back on a decision even though less senior, and turned out to be right",
  },
  {
    id: 'val_assume_best_intention',
    name: 'Assume Best Intention',
    description:
      'Give grace for a bad day, a clumsy message, an unaware tone. Address conflict directly. Extend trust.',
    behavior_placeholder:
      "e.g., raised a tense thread with the person directly and turned it into a calm working conversation",
  },
  {
    id: 'val_intellectual_honesty',
    name: 'Intellectual Honesty',
    description:
      'Own mistakes. Apologize before doubling down. Do not contort data to fit a narrative.',
    behavior_placeholder:
      "e.g., flagged their own error in the launch numbers before anyone else noticed",
  },
]

export const VALUE_IDS = new Set(VALUES.map((v) => v.id))

export function getValueById(id: string): ValueDef | null {
  return VALUES.find((v) => v.id === id) ?? null
}
