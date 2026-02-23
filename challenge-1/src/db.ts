import { PrismaClient } from './generated/prisma/client.js'

import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
})

declare global {
  var __prisma: PrismaClient | undefined
}

function createPrismaClient() {
  return new PrismaClient({ adapter })
}

function hasAuthDelegates(client: PrismaClient): boolean {
  return (
    'user' in client &&
    'session' in client &&
    'account' in client &&
    'verification' in client
  )
}

const cachedPrisma = globalThis.__prisma
export const prisma =
  cachedPrisma && hasAuthDelegates(cachedPrisma)
    ? cachedPrisma
    : createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma
}
