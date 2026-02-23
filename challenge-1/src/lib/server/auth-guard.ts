import { auth } from '#/lib/auth'

export type AuthenticatedSession = {
  user: { id: string; email?: string | null; name?: string | null }
  session: { id: string }
}

export async function getAuthenticatedSession(
  request: Request,
): Promise<AuthenticatedSession | null> {
  const sessionUrl = new URL('/api/auth/get-session', request.url)

  const sessionResponse = await auth.handler(
    new Request(sessionUrl, {
      method: 'GET',
      headers: request.headers,
    }),
  )

  if (!sessionResponse.ok) {
    return null
  }

  const sessionData = await sessionResponse.json().catch(() => null)

  if (!sessionData?.user?.id || !sessionData?.session?.id) {
    return null
  }

  return {
    user: {
      id: sessionData.user.id,
      email: sessionData.user.email,
      name: sessionData.user.name,
    },
    session: {
      id: sessionData.session.id,
    },
  }
}
