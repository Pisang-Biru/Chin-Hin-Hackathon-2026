import { describe, expect, it } from 'vitest'

import {
  applySessionStatusTransition,
  isTerminalSessionStatus,
  toRoutingSummaryStatus,
} from './deep-agents-session'

describe('deep-agents-session', () => {
  it('applies non-terminal transitions', () => {
    expect(applySessionStatusTransition('IN_PROGRESS', 'PENDING_APPROVAL')).toBe(
      'PENDING_APPROVAL',
    )
    expect(applySessionStatusTransition('PENDING_APPROVAL', 'COMPLETED')).toBe(
      'COMPLETED',
    )
  })

  it('keeps terminal states immutable', () => {
    expect(applySessionStatusTransition('COMPLETED', 'FAILED')).toBe('COMPLETED')
    expect(applySessionStatusTransition('REJECTED', 'PENDING_APPROVAL')).toBe(
      'REJECTED',
    )
  })

  it('maps session status to routing status', () => {
    expect(toRoutingSummaryStatus('COMPLETED')).toBe('COMPLETED')
    expect(toRoutingSummaryStatus('PENDING_APPROVAL')).toBe('PENDING_APPROVAL')
    expect(toRoutingSummaryStatus('FAILED')).toBe('PENDING_APPROVAL')
  })

  it('detects terminal statuses', () => {
    expect(isTerminalSessionStatus('COMPLETED')).toBe(true)
    expect(isTerminalSessionStatus('IN_PROGRESS')).toBe(false)
  })
})
