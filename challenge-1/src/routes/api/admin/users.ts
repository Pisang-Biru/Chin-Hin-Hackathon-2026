import { createFileRoute } from '@tanstack/react-router'
import { hashPassword } from 'better-auth/crypto'

import { prisma } from '@/db'
import { validateCreateAdminUserInput } from '@/lib/admin/user-admin-validation'
import { requireRoles } from '@/lib/server/auth-guard'
import { jsonResponse, sanitizeErrorMessage } from '@/lib/server/json-response'

export const Route = createFileRoute('/api/admin/users')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authz = await requireRoles(request, ['admin'])
        if (authz.response) {
          return authz.response
        }
        const principal = authz.principal!

        const [users, businessUnits] = await Promise.all([
          prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              createdAt: true,
              appProfile: {
                include: {
                  primaryBusinessUnit: {
                    select: { id: true, code: true, name: true },
                  },
                },
              },
            },
          }),
          prisma.businessUnit.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
            select: { id: true, code: true, name: true },
          }),
        ])

        console.info('[admin.users.list]', {
          userId: principal.userId,
          role: principal.role,
          usersCount: users.length,
        })

        return jsonResponse({
          users: users.map((user) => ({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role ?? 'bu_user',
            createdAt: user.createdAt,
            primaryBusinessUnitId: user.appProfile?.primaryBusinessUnitId ?? null,
            primaryBusinessUnit: user.appProfile?.primaryBusinessUnit ?? null,
          })),
          businessUnits,
        })
      },
      POST: async ({ request }) => {
        const authz = await requireRoles(request, ['admin'])
        if (authz.response) {
          return authz.response
        }
        const principal = authz.principal!

        const payload = await request.json().catch(() => null)
        const validated = validateCreateAdminUserInput(payload)
        if (!validated.data) {
          return jsonResponse({ error: validated.error || 'Invalid payload.' }, 400)
        }

        const { email, name, password, role, primaryBusinessUnitId } = validated.data

        if (primaryBusinessUnitId) {
          const businessUnit = await prisma.businessUnit.findUnique({
            where: { id: primaryBusinessUnitId },
            select: { id: true },
          })
          if (!businessUnit) {
            return jsonResponse({ error: 'Business unit not found.' }, 404)
          }
        }

        const existingUser = await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        })
        if (existingUser) {
          return jsonResponse({ error: 'A user with this email already exists.' }, 409)
        }

        try {
          const passwordHash = await hashPassword(password)

          const created = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
              data: {
                email,
                name,
                role,
              },
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
              },
            })

            await tx.account.create({
              data: {
                accountId: user.id,
                providerId: 'credential',
                userId: user.id,
                password: passwordHash,
              },
            })

            const appProfile = await tx.appUserProfile.create({
              data: {
                userId: user.id,
                primaryBusinessUnitId: role === 'bu_user' ? primaryBusinessUnitId : null,
              },
              include: {
                primaryBusinessUnit: {
                  select: { id: true, code: true, name: true },
                },
              },
            })

            return { user, appProfile }
          })

          console.info('[admin.users.create]', {
            userId: principal.userId,
            role: principal.role,
            targetUserId: created.user.id,
            targetRole: created.user.role,
            businessUnitId: created.appProfile.primaryBusinessUnitId ?? null,
          })

          return jsonResponse(
            {
              user: {
                id: created.user.id,
                email: created.user.email,
                name: created.user.name,
                role: created.user.role ?? 'bu_user',
                createdAt: created.user.createdAt,
                primaryBusinessUnitId: created.appProfile.primaryBusinessUnitId ?? null,
                primaryBusinessUnit: created.appProfile.primaryBusinessUnit ?? null,
              },
            },
            201,
          )
        } catch (error) {
          return jsonResponse(
            {
              error: 'Failed to create user.',
              details: sanitizeErrorMessage(error),
            },
            500,
          )
        }
      },
    },
  },
})
