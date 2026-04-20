export type Geo = 'US' | 'India' | 'Colombia'
export type EmploymentType = 'employee' | 'contractor'
export type RecognitionPreference = 'public' | 'team_only' | 'private'

export interface Employee {
  id: string
  name: string
  email: string
  geo: Geo
  manager_id: string | null
  role_title: string
  active: boolean
  employment_type: EmploymentType
  recognition_preference: RecognitionPreference
}

export interface EmployeeSummary {
  id: string
  name: string
  email: string
  geo: Geo
  role_title: string
  manager_id: string | null
}
