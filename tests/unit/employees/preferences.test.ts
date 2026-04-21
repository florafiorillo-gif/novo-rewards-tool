/** @jest-environment node */
import {
  getEmployeeById,
  getEmployeeByEmail,
  setRecognitionPreference,
  resetMockRecognitionOverrides,
} from '@/modules/employees/service'

beforeAll(() => {
  process.env.USE_MOCK_DATA = 'true'
})

beforeEach(() => {
  resetMockRecognitionOverrides()
})

describe('recognition_preference (spec §11.5)', () => {
  it('defaults reflect what the mock fixture declares', async () => {
    const rares = await getEmployeeById('emp_001')
    const jamie = await getEmployeeById('emp_007')
    const valentina = await getEmployeeById('emp_011')
    expect(rares?.recognition_preference).toBe('public')
    expect(jamie?.recognition_preference).toBe('team_only')
    expect(valentina?.recognition_preference).toBe('private')
  })

  it('setRecognitionPreference updates a subsequent read', async () => {
    await setRecognitionPreference('emp_006', 'private')
    const after = await getEmployeeById('emp_006')
    expect(after?.recognition_preference).toBe('private')
  })

  it('override is reflected in email-keyed reads too', async () => {
    await setRecognitionPreference('emp_006', 'team_only')
    const after = await getEmployeeByEmail('alex.rivera@novo.co')
    expect(after?.recognition_preference).toBe('team_only')
  })

  it('override for one employee does not leak to others', async () => {
    await setRecognitionPreference('emp_006', 'private')
    const other = await getEmployeeById('emp_005')
    expect(other?.recognition_preference).toBe('public')
  })

  it('reset clears overrides back to fixture defaults', async () => {
    await setRecognitionPreference('emp_001', 'private')
    resetMockRecognitionOverrides()
    const after = await getEmployeeById('emp_001')
    expect(after?.recognition_preference).toBe('public')
  })

  it('rejects an unknown employee id in mock mode', async () => {
    await expect(
      setRecognitionPreference('emp_does_not_exist', 'private')
    ).rejects.toThrow(/Unknown employee/)
  })

  it('round-trip across all three values', async () => {
    for (const pref of ['public', 'team_only', 'private'] as const) {
      await setRecognitionPreference('emp_006', pref)
      const after = await getEmployeeById('emp_006')
      expect(after?.recognition_preference).toBe(pref)
    }
  })
})
