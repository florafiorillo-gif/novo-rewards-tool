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
      return profile?.email?.endsWith(`@${allowedDomain}`) ?? false
    },

    async jwt({ token, profile }) {
      // profile is only present on the initial sign-in
      if (profile?.email) {
        try {
          const employee = await db.employee.findUnique({
            where: { email: profile.email },
            select: {
              id: true,
              geo: true,
              manager_id: true,
              role_title: true,
            },
          })
          if (employee) {
            token.employeeId = employee.id
            token.geo = employee.geo
            token.managerId = employee.manager_id
            token.roleTitle = employee.role_title
          }
        } catch {
          // DB not yet available (e.g. pre-migration local dev); session still works
        }
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
