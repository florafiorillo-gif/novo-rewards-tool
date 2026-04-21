'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { setRecognitionPreference } from '@/modules/employees/service'
import type { RecognitionPreference } from '@/modules/employees/types'

const VALID: RecognitionPreference[] = ['public', 'team_only', 'private']

export async function updateRecognitionPreferenceAction(
  formData: FormData
): Promise<void> {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) throw new Error('Not authenticated')

  const raw = (formData.get('preference') ?? '').toString()
  if (!VALID.includes(raw as RecognitionPreference)) return
  await setRecognitionPreference(employeeId, raw as RecognitionPreference)
  revalidatePath('/settings')
}
