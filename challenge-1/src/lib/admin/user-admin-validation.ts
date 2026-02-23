import type { AppRole } from '@/lib/server/auth-guard'

export type CreateAdminUserInput = {
  email: string
  name: string
  password: string
  role: AppRole
  primaryBusinessUnitId: string | null
}

export type UpdateAdminUserInput = {
  role?: AppRole
  primaryBusinessUnitId?: string | null
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseRole(input: unknown): AppRole | null {
  if (input === 'admin' || input === 'synergy' || input === 'bu_user') {
    return input
  }

  return null
}

export function validateCreateAdminUserInput(
  payload: unknown,
): { data?: CreateAdminUserInput; error?: string } {
  if (!payload || typeof payload !== 'object') {
    return { error: 'Invalid payload.' }
  }

  const raw = payload as Record<string, unknown>
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : ''
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const password = typeof raw.password === 'string' ? raw.password : ''
  const role = parseRole(raw.role)

  const primaryBusinessUnitId =
    typeof raw.primaryBusinessUnitId === 'string' && raw.primaryBusinessUnitId.length > 0
      ? raw.primaryBusinessUnitId
      : null

  if (!email || !EMAIL_PATTERN.test(email)) {
    return { error: 'A valid email is required.' }
  }

  if (!name) {
    return { error: 'Name is required.' }
  }

  if (password.length < 8 || password.length > 128) {
    return { error: 'Password must be between 8 and 128 characters.' }
  }

  if (!role) {
    return { error: 'Role must be one of admin, synergy, or bu_user.' }
  }

  if (role === 'bu_user' && !primaryBusinessUnitId) {
    return { error: 'primaryBusinessUnitId is required for bu_user.' }
  }

  return {
    data: {
      email,
      name,
      password,
      role,
      primaryBusinessUnitId: role === 'bu_user' ? primaryBusinessUnitId : null,
    },
  }
}

export function validateUpdateAdminUserInput(
  payload: unknown,
): { data?: UpdateAdminUserInput; error?: string } {
  if (!payload || typeof payload !== 'object') {
    return { error: 'Invalid payload.' }
  }

  const raw = payload as Record<string, unknown>
  const parsedRole = raw.role === undefined ? undefined : parseRole(raw.role)
  if (raw.role !== undefined && !parsedRole) {
    return { error: 'Role must be one of admin, synergy, or bu_user.' }
  }

  let primaryBusinessUnitId: string | null | undefined
  if (raw.primaryBusinessUnitId !== undefined) {
    if (raw.primaryBusinessUnitId === null) {
      primaryBusinessUnitId = null
    } else if (typeof raw.primaryBusinessUnitId === 'string') {
      const trimmed = raw.primaryBusinessUnitId.trim()
      primaryBusinessUnitId = trimmed.length > 0 ? trimmed : null
    } else {
      return { error: 'primaryBusinessUnitId must be a string or null.' }
    }
  }

  if (parsedRole === undefined && primaryBusinessUnitId === undefined) {
    return { error: 'No update fields provided.' }
  }

  return {
    data: {
      role: parsedRole,
      primaryBusinessUnitId,
    },
  }
}
