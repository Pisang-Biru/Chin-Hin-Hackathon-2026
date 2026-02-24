import { describe, expect, it } from 'vitest'

import {
  validateBuDecisionPayload,
  validateSynergyDecisionPayload,
} from './assignment-status-validation'

describe('validateSynergyDecisionPayload', () => {
  it('accepts APPROVED', () => {
    const result = validateSynergyDecisionPayload({ status: 'APPROVED' })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe('APPROVED')
  })

  it('accepts CANCELED', () => {
    const result = validateSynergyDecisionPayload({ status: 'CANCELED', reason: 'Not suitable' })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe('CANCELED')
    expect(result.reason).toBe('Not suitable')
  })

  it('rejects unsupported status', () => {
    const result = validateSynergyDecisionPayload({ status: 'DISPATCHED' })
    expect(result.error).toContain('Status')
  })
})

describe('validateBuDecisionPayload', () => {
  it('accepts DISPATCHED', () => {
    const result = validateBuDecisionPayload({ status: 'DISPATCHED' })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe('DISPATCHED')
  })

  it('accepts BU_REJECTED with reason', () => {
    const result = validateBuDecisionPayload({
      status: 'BU_REJECTED',
      reason: 'Need alternate SKU due to spec mismatch',
    })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe('BU_REJECTED')
  })

  it('rejects BU_REJECTED without reason', () => {
    const result = validateBuDecisionPayload({ status: 'BU_REJECTED', reason: 'no' })
    expect(result.error).toContain('Reason')
  })

  it('rejects unsupported status', () => {
    const result = validateBuDecisionPayload({ status: 'APPROVED' })
    expect(result.error).toContain('Status')
  })
})
