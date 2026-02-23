import { describe, expect, it } from 'vitest'

import { canAccessBusinessUnit } from './auth-guard'
import type { AuthPrincipal } from './auth-guard'

function buildPrincipal(overrides: Partial<AuthPrincipal>): AuthPrincipal {
  return {
    userId: 'user_1',
    sessionId: 'session_1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'bu_user',
    primaryBusinessUnitId: 'bu_1',
    primaryBusinessUnit: {
      id: 'bu_1',
      code: 'BU1',
      name: 'Business Unit 1',
    },
    ...overrides,
  }
}

describe('canAccessBusinessUnit', () => {
  it('allows admin to access any BU', () => {
    const principal = buildPrincipal({ role: 'admin' })
    expect(canAccessBusinessUnit(principal, 'bu_999')).toBe(true)
  })

  it('allows synergy to access any BU', () => {
    const principal = buildPrincipal({ role: 'synergy' })
    expect(canAccessBusinessUnit(principal, 'bu_999')).toBe(true)
  })

  it('allows BU user to access assigned BU', () => {
    const principal = buildPrincipal({ role: 'bu_user', primaryBusinessUnitId: 'bu_1' })
    expect(canAccessBusinessUnit(principal, 'bu_1')).toBe(true)
  })

  it('denies BU user when BU differs', () => {
    const principal = buildPrincipal({ role: 'bu_user', primaryBusinessUnitId: 'bu_1' })
    expect(canAccessBusinessUnit(principal, 'bu_2')).toBe(false)
  })
})
