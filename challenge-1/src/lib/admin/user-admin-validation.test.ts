import { describe, expect, it } from 'vitest'

import {
  validateCreateAdminUserInput,
  validateUpdateAdminUserInput,
} from './user-admin-validation'

describe('validateCreateAdminUserInput', () => {
  it('accepts bu_user payload with primary BU', () => {
    const result = validateCreateAdminUserInput({
      email: 'bu@example.com',
      name: 'BU User',
      password: 'TempPass#123',
      role: 'bu_user',
      primaryBusinessUnitId: 'bu_1',
    })

    expect(result.error).toBeUndefined()
    expect(result.data?.role).toBe('bu_user')
    expect(result.data?.primaryBusinessUnitId).toBe('bu_1')
  })

  it('rejects bu_user payload without primary BU', () => {
    const result = validateCreateAdminUserInput({
      email: 'bu@example.com',
      name: 'BU User',
      password: 'TempPass#123',
      role: 'bu_user',
    })

    expect(result.error).toContain('primaryBusinessUnitId')
  })
})

describe('validateUpdateAdminUserInput', () => {
  it('accepts role-only updates', () => {
    const result = validateUpdateAdminUserInput({ role: 'synergy' })
    expect(result.error).toBeUndefined()
    expect(result.data?.role).toBe('synergy')
  })

  it('rejects unknown role', () => {
    const result = validateUpdateAdminUserInput({ role: 'super_admin' })
    expect(result.error).toContain('Role')
  })
})
