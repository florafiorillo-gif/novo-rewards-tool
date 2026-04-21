'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { isPeopleTeamRep } from '@/modules/roles/service'
import {
  createScopeNoteTemplate,
  setScopeNoteActive,
} from '@/modules/scope-notes/service'

async function requirePeopleOps(): Promise<void> {
  const session = await auth()
  const id = session?.user?.employeeId
  if (!id) throw new Error('Not authenticated')
  if (!(await isPeopleTeamRep(id))) throw new Error('Not authorized')
}

export async function createScopeNoteAction(formData: FormData): Promise<void> {
  await requirePeopleOps()
  const tierStr = (formData.get('tier') ?? '').toString()
  const text = (formData.get('template_text') ?? '').toString().trim()
  const tier = tierStr === '1' ? 1 : tierStr === '2' ? 2 : tierStr === '3' ? 3 : null
  if (!tier || !text) return
  await createScopeNoteTemplate({ tier, template_text: text })
  revalidatePath('/people-ops/scope-notes')
}

export async function toggleScopeNoteActiveAction(formData: FormData): Promise<void> {
  await requirePeopleOps()
  const id = (formData.get('id') ?? '').toString()
  const active = formData.get('active') === 'true'
  if (!id) return
  await setScopeNoteActive(id, active)
  revalidatePath('/people-ops/scope-notes')
}
