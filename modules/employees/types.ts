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
  department: string | null
  is_department_head: boolean
  is_people_team_rep: boolean
  is_committee_member: boolean
  tier2_assignments_count: number
}

export interface EmployeeSummary {
  id: string
  name: string
  email: string
  geo: Geo
  role_title: string
  manager_id: string | null
}
