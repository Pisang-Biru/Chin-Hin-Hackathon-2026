export type SessionStatus =
  | 'IN_PROGRESS'
  | 'PENDING_APPROVAL'
  | 'COMPLETED'
  | 'REJECTED'
  | 'FAILED'

const TERMINAL_STATUSES: SessionStatus[] = ['COMPLETED', 'REJECTED', 'FAILED']

export function isTerminalSessionStatus(status: SessionStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export function applySessionStatusTransition(
  currentStatus: SessionStatus,
  nextStatus: SessionStatus,
): SessionStatus {
  if (isTerminalSessionStatus(currentStatus)) {
    return currentStatus
  }

  return nextStatus
}

export function toRoutingSummaryStatus(
  status: SessionStatus,
): 'PENDING_APPROVAL' | 'COMPLETED' {
  if (status === 'COMPLETED') {
    return 'COMPLETED'
  }

  return 'PENDING_APPROVAL'
}
