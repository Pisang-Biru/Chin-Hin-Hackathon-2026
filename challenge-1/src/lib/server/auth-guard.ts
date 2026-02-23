import { prisma } from '@/db'
import { auth } from '@/lib/auth'
import { jsonResponse } from '@/lib/server/json-response'

export type AppRole = 'admin' | 'synergy' | 'bu_user'

export type AuthenticatedSession = {
  user: {
    id: string
    email?: string | null
    name?: string | null
    role?: string | null
  }
  session: { id: string }
}

export type AuthPrincipal = {
  userId: string
  sessionId: string
  email?: string | null
  name?: string | null
  role: AppRole
  primaryBusinessUnitId: string | null
  primaryBusinessUnit:
    | {
        id: string
        code: string
        name: string
      }
    | null
}

function toRole(input: string | null | undefined): AppRole {
  if (input === 'admin' || input === 'synergy' || input === 'bu_user') {
    return input
  }

  return 'bu_user'
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
      id: sessionData.user.id as string,
      email: (sessionData.user.email as string | null | undefined) ?? null,
      name: (sessionData.user.name as string | null | undefined) ?? null,
      role: (sessionData.user.role as string | null | undefined) ?? null,
    },
    session: {
      id: sessionData.session.id as string,
    },
  }
}

export async function getPrincipal(request: Request): Promise<AuthPrincipal | null> {
  const session = await getAuthenticatedSession(request)
  if (!session) {
    return null
  }

  const profile = await prisma.appUserProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      primaryBusinessUnit: {
        select: { id: true, code: true, name: true },
      },
    },
  })

  return {
    userId: session.user.id,
    sessionId: session.session.id,
    email: session.user.email,
    name: session.user.name,
    role: toRole(session.user.role),
    primaryBusinessUnitId: profile?.primaryBusinessUnitId ?? null,
    primaryBusinessUnit: profile?.primaryBusinessUnit ?? null,
  }
}

export async function requireRoles(
  request: Request,
  allowedRoles: AppRole[],
): Promise<{ principal?: AuthPrincipal; response?: Response }> {
  const principal = await getPrincipal(request)
  if (!principal) {
    return { response: jsonResponse({ error: 'Unauthorized' }, 401) }
  }

  if (!allowedRoles.includes(principal.role)) {
    return { response: jsonResponse({ error: 'Forbidden' }, 403) }
  }

  return { principal }
}

export function canAccessBusinessUnit(
  principal: AuthPrincipal,
  businessUnitId: string,
): boolean {
  if (principal.role === 'admin' || principal.role === 'synergy') {
    return true
  }

  if (!principal.primaryBusinessUnitId) {
    return false
  }

  return principal.primaryBusinessUnitId === businessUnitId
}
