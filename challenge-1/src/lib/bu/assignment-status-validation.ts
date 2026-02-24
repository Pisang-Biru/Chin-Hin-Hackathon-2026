export type SynergyDecisionStatus = 'APPROVED' | 'CANCELED'
export type BuDecisionStatus = 'DISPATCHED' | 'BU_REJECTED'

type StatusPayloadResult<TStatus extends string> = {
  status?: TStatus
  reason?: string
  error?: string
}

function parseReason(payload: unknown): string {
  const reasonRaw = (payload as { reason?: unknown }).reason
  if (typeof reasonRaw !== 'string') {
    return ''
  }
  return reasonRaw.trim()
}

export function validateSynergyDecisionPayload(
  payload: unknown,
): StatusPayloadResult<SynergyDecisionStatus> {
  if (!payload || typeof payload !== 'object') {
    return { error: 'Invalid payload.' }
  }

  const status = (payload as { status?: unknown }).status
  if (status !== 'APPROVED' && status !== 'CANCELED') {
    return { error: 'Status must be APPROVED or CANCELED.' }
  }

  return {
    status,
    reason: parseReason(payload),
  }
}

export function validateBuDecisionPayload(
  payload: unknown,
): StatusPayloadResult<BuDecisionStatus> {
  if (!payload || typeof payload !== 'object') {
    return { error: 'Invalid payload.' }
  }

  const status = (payload as { status?: unknown }).status
  if (status !== 'DISPATCHED' && status !== 'BU_REJECTED') {
    return { error: 'Status must be DISPATCHED or BU_REJECTED.' }
  }

  const reason = parseReason(payload)
  if (status === 'BU_REJECTED' && reason.length < 5) {
    return { error: 'Reason is required when rejecting (minimum 5 characters).' }
  }

  return {
    status,
    reason,
  }
}
