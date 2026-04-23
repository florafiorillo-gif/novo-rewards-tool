import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { db } from '@/lib/db'

// Directory resolution respects the USE_MOCK_DATA dev flag so local
// click-through works without a live Postgres. Keeps auth in sync with
// the rest of the service layer's mock/DB split.
type EmployeeFields = {
  id: string
  email: string
  name: string
  geo: string
  manager_id: string | null
  role_title: string
}

async function resolveEmployeeByEmail(
  email: string
): Promise<EmployeeFields | null> {
  const normalized = email.trim().toLowerCase()
  if (process.env.USE_MOCK_DATA === 'true') {
    const { MOCK_EMPLOYEES } = await import('@/modules/employees/mock-data')
    const emp = MOCK_EMPLOYEES.find(
      (e) => e.email.toLowerCase() === normalized && e.active
    )
    if (!emp) return null
    return {
      id: emp.id,
      email: emp.email,
      name: emp.name,
      geo: emp.geo,
      manager_id: emp.manager_id,
      role_title: emp.role_title,
    }
  }
  const row = await db.employee.findUnique({
    where: { email: normalized },
    select: {
      id: true,
      email: true,
      name: true,
      geo: true,
      manager_id: true,
      role_title: true,
      active: true,
    },
  })
  if (!row || !row.active) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    geo: row.geo,
    manager_id: row.manager_id,
    role_title: row.role_title,
  }
}

// Mock-data signin. Gated on USE_MOCK_DATA alone so the Vercel testing
// deploy (no Google OAuth yet, URL-level password protection via Vercel)
// can still authenticate seeded employees in production mode. When on,
// Google is skipped entirely — the signin page shows only the email form
// and no OAuth redirect path exists. Turn off by unsetting USE_MOCK_DATA
// in the target environment.
export const DEV_SIGNIN_ENABLED = process.env.USE_MOCK_DATA === 'true'

const providers = []

if (
  !DEV_SIGNIN_ENABLED &&
  process.env.AUTH_GOOGLE_ID &&
  process.env.AUTH_GOOGLE_SECRET
) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    })
  )
}

if (DEV_SIGNIN_ENABLED) {
  providers.push(
    Credentials({
      id: 'dev-email',
      name: 'Dev (mock)',
      credentials: {
        email: {
          label: 'Novo email',
          type: 'email',
          placeholder: 'cat@novo.co',
        },
      },
      async authorize(creds) {
        const raw = (creds?.email as string | undefined) ?? ''
        const email = raw.trim().toLowerCase()
        if (!email) return null
        const employee = await resolveEmployeeByEmail(email)
        if (!employee) return null
        return { id: employee.id, email: employee.email, name: employee.name }
      },
    })
  )
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers,
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    async signIn({ profile, user, account }) {
      // Credentials provider authorize() has already validated the row; the
      // domain gate doesn't apply (operator is picking a known seeded user).
      if (account?.provider === 'dev-email') return true

      const email = profile?.email ?? user?.email ?? null
      const allowedDomain = process.env.AUTH_ALLOWED_DOMAIN ?? 'novo.co'
      if (!email?.endsWith(`@${allowedDomain}`)) return false

      try {
        const employee = await resolveEmployeeByEmail(email)
        if (!employee) {
          console.error(
            `[auth] signIn blocked: no Employee row for ${email}. Seed the directory or onboard this user in Zoho.`
          )
          return false
        }
        return true
      } catch (err) {
        console.error(
          `[auth] signIn blocked: lookup failed for ${email}`,
          err
        )
        throw err
      }
    },

    async jwt({ token, profile, user }) {
      // OAuth gives us `profile` on first signin; Credentials gives us `user`.
      // Both only populate on the initial signin hop; later requests reuse
      // the token as-is.
      const email = profile?.email ?? user?.email ?? null
      if (email) {
        const employee = await resolveEmployeeByEmail(email)
        if (!employee) {
          throw new Error(
            `[auth] jwt: Employee row vanished between signIn and jwt for ${email}`
          )
        }
        token.employeeId = employee.id
        token.geo = employee.geo
        token.managerId = employee.manager_id
        token.roleTitle = employee.role_title
      }
      return token
    },

    async session({ session, token }) {
      const t = token as typeof token & {
        employeeId?: string
        geo?: string
        managerId?: string | null
        roleTitle?: string
      }
      if (t.employeeId) {
        session.user.employeeId = t.employeeId
        session.user.geo = t.geo ?? ''
        session.user.managerId = t.managerId ?? null
        session.user.roleTitle = t.roleTitle ?? ''
      }
      return session
    },
  },
})
