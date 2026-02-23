import { prisma } from '@/db'
import { generateDispatchArtifacts } from '@/lib/assignments/artifact-generator'
import type { GeneratedAssignmentArtifact } from '@/lib/assignments/artifact-generator'
import type { AssignmentUpdateStatus } from '@/lib/bu/assignment-status-validation'

type UpdatedAssignmentResult = {
  assignment: {
    id: string
    status: 'APPROVED' | 'DISPATCHED' | 'CANCELED'
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
  status: AssignmentUpdateStatus
  actedBy: string
}

export async function updateAssignmentWithDispatchWorkflow(
  input: UpdateAssignmentWorkflowInput,
): Promise<UpdatedAssignmentResult> {
  const updatedAssignment = await prisma.assignment.update({
    where: { id: input.assignmentId },
    data: {
      status: input.status,
      dispatchedAt: input.status === 'DISPATCHED' ? new Date() : null,
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
