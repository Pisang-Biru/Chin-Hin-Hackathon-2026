export type AssignmentUpdateStatus = 'DISPATCHED' | 'CANCELED'

export function validateAssignmentStatusPayload(
  payload: unknown,
): { status?: AssignmentUpdateStatus; error?: string } {
  if (!payload || typeof payload !== 'object') {
    return { error: 'Invalid payload.' }
  }

  const status = (payload as { status?: unknown }).status
  if (status !== 'DISPATCHED' && status !== 'CANCELED') {
    return { error: 'Status must be DISPATCHED or CANCELED.' }
  }

  return { status }
}
