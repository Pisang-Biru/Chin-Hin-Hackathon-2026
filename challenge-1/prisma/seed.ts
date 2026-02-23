import { hashPassword } from 'better-auth/crypto'

import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
})

const prisma = new PrismaClient({ adapter })

const TEMP_PASSWORD = 'TempPass#123'

type SeedUser = {
  email: string
  name: string
  role: 'admin' | 'synergy' | 'bu_user'
  businessUnitCode?: string
}

async function seedUsers() {
  const businessUnits = await prisma.businessUnit.findMany({
    select: { id: true, code: true, name: true },
  })
  const businessUnitByCode = new Map(businessUnits.map((bu) => [bu.code, bu]))

  const usersToSeed: SeedUser[] = [
    {
      email: 'admin@chin-hin.local',
      name: 'Platform Admin',
      role: 'admin',
    },
    {
      email: 'synergy@chin-hin.local',
      name: 'Synergy Team',
      role: 'synergy',
    },
    {
      email: 'aac@chin-hin.local',
      name: 'Starken AAC User',
      role: 'bu_user',
      businessUnitCode: 'STARKEN_AAC',
    },
    {
      email: 'drymix@chin-hin.local',
      name: 'Starken Drymix User',
      role: 'bu_user',
      businessUnitCode: 'STARKEN_DRYMIX',
    },
    {
      email: 'gcast@chin-hin.local',
      name: 'GCast User',
      role: 'bu_user',
      businessUnitCode: 'GCAST',
    },
    {
      email: 'makna@chin-hin.local',
      name: 'Makna User',
      role: 'bu_user',
      businessUnitCode: 'MAKNA',
    },
    {
      email: 'sag@chin-hin.local',
      name: 'SAG User',
      role: 'bu_user',
      businessUnitCode: 'SAG',
    },
  ]

  const passwordHash = await hashPassword(TEMP_PASSWORD)

  for (const seedUser of usersToSeed) {
    const businessUnit =
      seedUser.businessUnitCode !== undefined
        ? businessUnitByCode.get(seedUser.businessUnitCode)
        : undefined

    if (seedUser.role === 'bu_user' && !businessUnit) {
      throw new Error(
        `Missing business unit for code ${seedUser.businessUnitCode ?? 'unknown'}.`,
      )
    }

    const user = await prisma.user.upsert({
      where: { email: seedUser.email.toLowerCase() },
      create: {
        email: seedUser.email.toLowerCase(),
        name: seedUser.name,
        role: seedUser.role,
      },
      update: {
        name: seedUser.name,
        role: seedUser.role,
      },
      select: { id: true, email: true, role: true },
    })

    await prisma.account.upsert({
      where: {
        providerId_accountId: {
          providerId: 'credential',
          accountId: user.id,
        },
      },
      create: {
        accountId: user.id,
        providerId: 'credential',
        userId: user.id,
        password: passwordHash,
      },
      update: {
        password: passwordHash,
      },
    })

    await prisma.appUserProfile.upsert({
      where: {
        userId: user.id,
      },
      create: {
        userId: user.id,
        primaryBusinessUnitId: seedUser.role === 'bu_user' ? businessUnit!.id : null,
      },
      update: {
        primaryBusinessUnitId: seedUser.role === 'bu_user' ? businessUnit!.id : null,
      },
    })
  }

  console.log('✅ Seeded auth users:')
  for (const user of usersToSeed) {
    const businessUnitName = user.businessUnitCode
      ? businessUnitByCode.get(user.businessUnitCode)?.name ?? 'Unknown BU'
      : 'N/A'
    console.log(`- ${user.email} (${user.role}) BU: ${businessUnitName}`)
  }
}

async function main() {
  console.log('🌱 Seeding database...')

  await prisma.feedbackEvent.deleteMany()
  await prisma.assignmentArtifact.deleteMany()
  await prisma.assignment.deleteMany()
  await prisma.agentLog.deleteMany()
  await prisma.recommendationSku.deleteMany()
  await prisma.routingRecommendation.deleteMany()
  await prisma.routingRun.deleteMany()
  await prisma.routingRuleCondition.deleteMany()
  await prisma.routingRuleSet.deleteMany()
  await prisma.leadFact.deleteMany()
  await prisma.lead.deleteMany()
  await prisma.leadDocument.deleteMany()
  await prisma.buSku.deleteMany()
  await prisma.businessUnit.deleteMany()

  const businessUnits = await prisma.businessUnit.createManyAndReturn({
    data: [
      {
        code: 'STARKEN_AAC',
        name: 'Starken AAC',
        description: 'AAC block and panel specialist',
      },
      {
        code: 'STARKEN_DRYMIX',
        name: 'Starken Drymix',
        description: 'Drymix solutions for render and skimcoat',
      },
      {
        code: 'GCAST',
        name: 'GCast',
        description: 'Precast concrete products',
      },
      {
        code: 'MAKNA',
        name: 'Makna Setia',
        description: 'Construction and engineering delivery',
      },
      {
        code: 'SAG',
        name: 'Signature Alliance Group',
        description: 'Interior fit-out and project management',
      },
    ],
  })

  for (const bu of businessUnits) {
    await prisma.routingRuleSet.create({
      data: {
        businessUnitId: bu.id,
        version: 1,
        status: 'ACTIVE',
        notes: 'Seed v1 baseline rules for hackathon routing.',
        conditions: {
          create: [
            {
              factKey: 'project_type',
              operator: 'IN',
              comparisonValues: ['residential', 'commercial', 'industrial'],
              weight: '0.30',
              isRequired: true,
            },
            {
              factKey: 'project_stage',
              operator: 'IN',
              comparisonValues: ['planning', 'tender', 'construction'],
              weight: '0.20',
              isRequired: true,
            },
            {
              factKey: 'development_type',
              operator: 'IN',
              comparisonValues: ['new_construction', 'refurbishment', 'fit_out'],
              weight: '0.15',
            },
            {
              factKey: 'region',
              operator: 'EXISTS',
              weight: '0.10',
              isRequired: true,
            },
            {
              factKey: 'construction_start_year',
              operator: 'GTE',
              comparisonValue: '2025',
              weight: '0.10',
            },
            {
              factKey: 'project_value_band',
              operator: 'IN',
              comparisonValues: ['lt_10m', '10m_50m', '50m_100m', 'gt_100m'],
              weight: '0.10',
            },
            {
              factKey: 'stakeholder_name',
              operator: 'EXISTS',
              weight: '0.05',
            },
          ],
        },
      },
    })
  }

  await prisma.buSku.createMany({
    data: [
      {
        businessUnitId: businessUnits.find((bu) => bu.code === 'STARKEN_AAC')!.id,
        skuCode: 'AAC-BLOCK-100',
        skuName: 'AAC Block 100mm',
        skuCategory: 'Block',
      },
      {
        businessUnitId: businessUnits.find((bu) => bu.code === 'STARKEN_AAC')!.id,
        skuCode: 'AAC-PANEL-WALL',
        skuName: 'AAC Wall Panel',
        skuCategory: 'Panel',
      },
      {
        businessUnitId: businessUnits.find((bu) => bu.code === 'STARKEN_DRYMIX')!.id,
        skuCode: 'DRYMIX-RENDER',
        skuName: 'Exterior Render',
        skuCategory: 'Drymix',
      },
      {
        businessUnitId: businessUnits.find((bu) => bu.code === 'STARKEN_DRYMIX')!.id,
        skuCode: 'DRYMIX-SKIM',
        skuName: 'Skimcoat',
        skuCategory: 'Drymix',
      },
      {
        businessUnitId: businessUnits.find((bu) => bu.code === 'GCAST')!.id,
        skuCode: 'GCAST-MANHOLE',
        skuName: 'Precast Manhole',
        skuCategory: 'Infrastructure',
      },
      {
        businessUnitId: businessUnits.find((bu) => bu.code === 'GCAST')!.id,
        skuCode: 'GCAST-DRAIN',
        skuName: 'Precast Drain',
        skuCategory: 'Infrastructure',
      },
      {
        businessUnitId: businessUnits.find((bu) => bu.code === 'MAKNA')!.id,
        skuCode: 'MAKNA-DB-01',
        skuName: 'Design & Build Package',
        skuCategory: 'Construction',
      },
      {
        businessUnitId: businessUnits.find((bu) => bu.code === 'MAKNA')!.id,
        skuCode: 'MAKNA-INFRA-01',
        skuName: 'Infrastructure Works Package',
        skuCategory: 'Construction',
      },
      {
        businessUnitId: businessUnits.find((bu) => bu.code === 'SAG')!.id,
        skuCode: 'SAG-FITOUT-COM',
        skuName: 'Commercial Fit-Out',
        skuCategory: 'Interior',
      },
      {
        businessUnitId: businessUnits.find((bu) => bu.code === 'SAG')!.id,
        skuCode: 'SAG-PM',
        skuName: 'Project Management Services',
        skuCategory: 'Services',
      },
    ],
  })

  await seedUsers()

  console.log(
    `✅ Seeded ${businessUnits.length} business units with baseline rules and SKUs`,
  )
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
