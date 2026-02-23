import { createFileRoute } from '@tanstack/react-router'

import { prisma } from '@/db'
import { validateUpdateAdminUserInput } from '@/lib/admin/user-admin-validation'
import { requireRoles } from '@/lib/server/auth-guard'
import { jsonResponse, sanitizeErrorMessage } from '@/lib/server/json-response'

export const Route = createFileRoute('/api/admin/users/$userId')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const authz = await requireRoles(request, ['admin'])
        if (authz.response) {
          return authz.response
        }
        const principal = authz.principal!

        const payload = await request.json().catch(() => null)
        const validated = validateUpdateAdminUserInput(payload)
        if (!validated.data) {
          return jsonResponse({ error: validated.error || 'Invalid payload.' }, 400)
        }

        const targetUser = await prisma.user.findUnique({
          where: { id: params.userId },
          include: {
            appProfile: true,
          },
        })
        if (!targetUser) {
          return jsonResponse({ error: 'User not found.' }, 404)
        }

        const requestedRole = validated.data.role
        const nextRole = requestedRole ?? targetUser.role ?? 'bu_user'

        const nextBusinessUnitId =
          validated.data.primaryBusinessUnitId !== undefined
            ? validated.data.primaryBusinessUnitId
            : targetUser.appProfile?.primaryBusinessUnitId ?? null

        if (nextRole === 'bu_user' && !nextBusinessUnitId) {
          return jsonResponse(
            { error: 'primaryBusinessUnitId is required when role is bu_user.' },
            400,
          )
        }

        if (nextBusinessUnitId) {
          const businessUnit = await prisma.businessUnit.findUnique({
            where: { id: nextBusinessUnitId },
            select: { id: true },
          })
          if (!businessUnit) {
            return jsonResponse({ error: 'Business unit not found.' }, 404)
          }
        }

        try {
          const updated = await prisma.$transaction(async (tx) => {
            const user = await tx.user.update({
              where: { id: targetUser.id },
              data: {
                role: nextRole,
              },
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
              },
            })

            const appProfile = await tx.appUserProfile.upsert({
              where: {
                userId: targetUser.id,
              },
              create: {
                userId: targetUser.id,
                primaryBusinessUnitId: nextRole === 'bu_user' ? nextBusinessUnitId : null,
              },
              update: {
                primaryBusinessUnitId: nextRole === 'bu_user' ? nextBusinessUnitId : null,
              },
              include: {
                primaryBusinessUnit: {
                  select: { id: true, code: true, name: true },
                },
              },
            })

            return { user, appProfile }
          })

          console.info('[admin.users.update]', {
            userId: principal.userId,
            role: principal.role,
            targetUserId: updated.user.id,
            targetRole: updated.user.role,
            businessUnitId: updated.appProfile.primaryBusinessUnitId ?? null,
          })

          return jsonResponse({
            user: {
              id: updated.user.id,
              email: updated.user.email,
              name: updated.user.name,
              role: updated.user.role ?? 'bu_user',
              createdAt: updated.user.createdAt,
              primaryBusinessUnitId: updated.appProfile.primaryBusinessUnitId ?? null,
              primaryBusinessUnit: updated.appProfile.primaryBusinessUnit ?? null,
            },
          })
        } catch (error) {
          return jsonResponse(
            {
              error: 'Failed to update user.',
              details: sanitizeErrorMessage(error),
            },
            500,
          )
        }
      },
    },
  },
})
