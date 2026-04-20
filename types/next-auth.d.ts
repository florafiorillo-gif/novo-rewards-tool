import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      employeeId: string
      geo: string
      managerId: string | null
      roleTitle: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    employeeId?: string
    geo?: string
    managerId?: string | null
    roleTitle?: string
  }
}
