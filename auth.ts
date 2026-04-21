import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { db } from '@/lib/db'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    async signIn({ profile }) {
      const allowedDomain = process.env.AUTH_ALLOWED_DOMAIN ?? 'novo.co'
      if (!profile?.email?.endsWith(`@${allowedDomain}`)) return false

      // Require a seeded Employee row. A session without employeeId/geo/manager_id
      // breaks every role-gated page, so fail closed rather than hand out a
      // partial session.
      try {
        const employee = await db.employee.findUnique({
          where: { email: profile.email },
          select: { id: true },
        })
        if (!employee) {
          console.error(
            `[auth] signIn blocked: no Employee row for ${profile.email}. Seed the directory or onboard this user in Zoho.`
          )
          return false
        }
        return true
      } catch (err) {
        console.error(
          `[auth] signIn blocked: DB lookup failed for ${profile.email}`,
          err
        )
        throw err
      }
    },

    async jwt({ token, profile }) {
      // profile is only present on the initial sign-in. signIn already verified
      // the row exists, so a miss here is an unexpected race (employee deleted
      // between signIn and jwt) — fail loudly rather than silently.
      if (profile?.email) {
        const employee = await db.employee.findUnique({
          where: { email: profile.email },
          select: {
            id: true,
            geo: true,
            manager_id: true,
            role_title: true,
          },
        })
        if (!employee) {
          throw new Error(
            `[auth] jwt: Employee row vanished between signIn and jwt for ${profile.email}`
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
      // NextAuth v5-beta's JWT module-augmentation doesn't merge with `next-auth/jwt`
      // under strict mode; cast through the augmented shape we declared in
      // types/next-auth.d.ts. Drop once v5 stable ships.
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
