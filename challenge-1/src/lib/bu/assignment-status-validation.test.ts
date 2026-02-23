import { describe, expect, it } from 'vitest'

import { validateAssignmentStatusPayload } from './assignment-status-validation'

describe('validateAssignmentStatusPayload', () => {
  it('accepts DISPATCHED', () => {
    const result = validateAssignmentStatusPayload({ status: 'DISPATCHED' })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe('DISPATCHED')
  })

  it('accepts CANCELED', () => {
    const result = validateAssignmentStatusPayload({ status: 'CANCELED' })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe('CANCELED')
  })

  it('rejects unsupported status', () => {
    const result = validateAssignmentStatusPayload({ status: 'APPROVED' })
    expect(result.error).toContain('Status')
  })
})
