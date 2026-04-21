'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isPeopleTeamRep } from '@/modules/roles/service'
import {
  createCatalogItem,
  updateCatalogItem,
} from '@/modules/catalog/service'
import type { RewardType } from '@/modules/catalog/types'
import type { Geo } from '@/modules/employees/types'

async function requirePeopleOps(): Promise<void> {
  const session = await auth()
  const id = session?.user?.employeeId
  if (!id) throw new Error('Not authenticated')
  if (!(await isPeopleTeamRep(id))) throw new Error('Not authorized')
}

const VALID_GEOS: Geo[] = ['US', 'India', 'Colombia']
const VALID_REWARD_TYPES: RewardType[] = [
  'gift_card',
  'experience',
  'l_and_d',
  'cash',
  'custom',
]

export async function createCatalogItemAction(formData: FormData): Promise<void> {
  await requirePeopleOps()
  const geo = (formData.get('geo') ?? '').toString()
  const rewardType = (formData.get('reward_type') ?? '').toString()
  const name = (formData.get('name') ?? '').toString().trim()
  const description = (formData.get('description') ?? '').toString().trim()
  const vendor = (formData.get('vendor') ?? '').toString().trim()
  const amountStr = (formData.get('amount_usd') ?? '').toString()
  const amount = Number.parseFloat(amountStr)

  if (
    !VALID_GEOS.includes(geo as Geo) ||
    !VALID_REWARD_TYPES.includes(rewardType as RewardType) ||
    !name ||
    !description ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return
  }

  await createCatalogItem({
    geo: geo as Geo,
    reward_type: rewardType as RewardType,
    vendor: vendor.length > 0 ? vendor : undefined,
    name,
    description,
    amount_usd: amount,
  })
  redirect('/people-ops/catalog')
}

export async function toggleCatalogItemActiveAction(
  formData: FormData
): Promise<void> {
  await requirePeopleOps()
  const id = (formData.get('id') ?? '').toString()
  const nextActive = formData.get('active') === 'true'
  if (!id) return
  await updateCatalogItem(id, { active: nextActive })
  revalidatePath('/people-ops/catalog')
}
