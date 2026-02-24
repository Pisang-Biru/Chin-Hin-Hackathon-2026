import { prisma } from '@/db'
import { generateDispatchArtifacts } from '@/lib/assignments/artifact-generator'
import type { GeneratedAssignmentArtifact } from '@/lib/assignments/artifact-generator'
import type {
  BuDecisionStatus,
  SynergyDecisionStatus,
} from '@/lib/bu/assignment-status-validation'

type AssignmentWorkflowStatus = SynergyDecisionStatus | BuDecisionStatus

type DecisionMetadata = {
  synergyDecision?: {
    status: 'APPROVED' | 'CANCELED'
    reason: string | null
    actedBy: string
    actedAt: string
  }
  buDecision?: {
    status: 'DISPATCHED' | 'BU_REJECTED'
    reason: string | null
    actedBy: string
    actedAt: string
  }
}

type UpdatedAssignmentResult = {
  assignment: {
    id: string
    status: 'PENDING_SYNERGY' | 'APPROVED' | 'DISPATCHED' | 'BU_REJECTED' | 'CANCELED'
    assignedRole: 'PRIMARY' | 'CROSS_SELL'
    approvedAt: Date
    dispatchedAt: Date | null
    businessUnit: {
      id: string
      code: string
      name: string
    }
    lead: {
      id: string
      projectName: string | null
      locationText: string | null
      currentStatus: string
    }
  }
  generatedArtifacts: GeneratedAssignmentArtifact[]
}

type UpdateAssignmentWorkflowInput = {
  assignmentId: string
  status: AssignmentWorkflowStatus
  actedBy: string
  reason?: string
}

export async function updateAssignmentWithDispatchWorkflow(
  input: UpdateAssignmentWorkflowInput,
): Promise<UpdatedAssignmentResult> {
  const existingAssignment = await prisma.assignment.findUnique({
    where: { id: input.assignmentId },
    select: {
      id: true,
      requiredActions: true,
    },
  })

  if (!existingAssignment) {
    throw new Error('Assignment not found.')
  }

  const now = new Date()
  const existingMetadata =
    existingAssignment.requiredActions && typeof existingAssignment.requiredActions === 'object'
      ? (existingAssignment.requiredActions as DecisionMetadata)
      : {}
  const nextMetadata: DecisionMetadata = { ...existingMetadata }

  if (input.status === 'APPROVED' || input.status === 'CANCELED') {
    nextMetadata.synergyDecision = {
      status: input.status,
      reason: input.reason?.trim() || null,
      actedBy: input.actedBy,
      actedAt: now.toISOString(),
    }
  }

  if (input.status === 'DISPATCHED' || input.status === 'BU_REJECTED') {
    nextMetadata.buDecision = {
      status: input.status,
      reason: input.reason?.trim() || null,
      actedBy: input.actedBy,
      actedAt: now.toISOString(),
    }
  }

  const updatedAssignment = await prisma.assignment.update({
    where: { id: input.assignmentId },
    data: {
      status: input.status,
      approvedBy: input.status === 'APPROVED' ? input.actedBy : undefined,
      approvedAt: input.status === 'APPROVED' ? now : undefined,
      dispatchedAt: input.status === 'DISPATCHED' ? now : null,
      requiredActions: nextMetadata,
    },
    include: {
      businessUnit: {
        select: { id: true, code: true, name: true },
      },
      lead: {
        select: { id: true, projectName: true, locationText: true, currentStatus: true },
      },
    },
  })

  let generatedArtifacts: GeneratedAssignmentArtifact[] = []
  if (input.status === 'DISPATCHED') {
    generatedArtifacts = await generateDispatchArtifacts(updatedAssignment.id, input.actedBy)
  }

  return {
    assignment: {
      id: updatedAssignment.id,
      status: updatedAssignment.status,
      assignedRole: updatedAssignment.assignedRole,
      approvedAt: updatedAssignment.approvedAt,
      dispatchedAt: updatedAssignment.dispatchedAt,
      businessUnit: updatedAssignment.businessUnit,
      lead: updatedAssignment.lead,
    },
    generatedArtifacts,
  }
}
