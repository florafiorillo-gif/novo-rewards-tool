export { auth as middleware } from '@/auth'

export const config = {
  // Protect all routes except auth callbacks, static files, and images
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
