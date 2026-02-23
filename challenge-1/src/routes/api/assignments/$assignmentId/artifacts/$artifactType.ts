import { createFileRoute } from '@tanstack/react-router'

import { prisma } from '@/db'
import { readArtifactFile } from '@/lib/assignments/artifact-generator'
import { canAccessBusinessUnit, requireRoles } from '@/lib/server/auth-guard'
import { jsonResponse } from '@/lib/server/json-response'

function toArtifactType(raw: string): 'JSON' | 'PDF' | null {
  const normalized = raw.toLowerCase().trim()
  if (normalized === 'json') {
    return 'JSON'
  }
  if (normalized === 'pdf') {
    return 'PDF'
  }
  return null
}

function toContentType(type: 'JSON' | 'PDF'): string {
  if (type === 'JSON') {
    return 'application/json; charset=utf-8'
  }
  return 'application/pdf'
}

function toExtension(type: 'JSON' | 'PDF'): string {
  if (type === 'JSON') {
    return 'json'
  }
  return 'pdf'
}

export const Route = createFileRoute('/api/assignments/$assignmentId/artifacts/$artifactType')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const authz = await requireRoles(request, ['admin', 'synergy', 'bu_user'])
        if (authz.response) {
          return authz.response
        }
        const principal = authz.principal!

        const artifactType = toArtifactType(params.artifactType)
        if (!artifactType) {
          return jsonResponse({ error: 'Invalid artifact type.' }, 400)
        }

        const assignment = await prisma.assignment.findUnique({
          where: { id: params.assignmentId },
          select: {
            id: true,
            businessUnitId: true,
          },
        })

        if (!assignment) {
          return jsonResponse({ error: 'Assignment not found.' }, 404)
        }

        if (!canAccessBusinessUnit(principal, assignment.businessUnitId)) {
          return jsonResponse({ error: 'Forbidden' }, 403)
        }

        const artifact = await prisma.assignmentArtifact.findFirst({
          where: {
            assignmentId: assignment.id,
            artifactType,
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            storagePath: true,
          },
        })

        if (!artifact) {
          return jsonResponse({ error: 'Artifact not found.' }, 404)
        }

        const bytes = await readArtifactFile(artifact.storagePath).catch(() => null)
        if (!bytes) {
          return jsonResponse({ error: 'Artifact file missing.' }, 404)
        }

        return new Response(bytes, {
          status: 200,
          headers: {
            'content-type': toContentType(artifactType),
            'content-disposition': `attachment; filename="assignment-${assignment.id}.${toExtension(artifactType)}"`,
          },
        })
      },
    },
  },
})
