import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { RecommendationRole, RuleOperator } from '@/generated/prisma/enums'
import { normalizeToLeadFacts } from '@/lib/leads/normalize-extraction'
import { orchestrateBuRecommendation } from '@/lib/swarm/agent-orchestration'

import {
  rankDeterministicBuScores,
  scoreBusinessUnitsDeterministically,
} from './deterministic-engine'
import type { BuRuleSetInput } from './deterministic-engine'

type ChallengeFixture = {
  id: string
  name: string
  rawExtraction: unknown
  ruleSets: Array<{
    businessUnitId: string
    businessUnitCode: string
    businessUnitName: string
    conditions: Array<{
      factKey: string
      operator: RuleOperator
      comparisonValue?: string
      comparisonValues?: string[]
      weight: number
      isRequired: boolean
    }>
  }>
  expected: {
    factsInclude: string[]
    primaryBusinessUnitCode: string
    crossSellBusinessUnitCodes: string[]
  }
}

const SKU_FIXTURE_BY_BU_CODE: Record<
  string,
  Array<{
    id: string
    skuCode: string
    skuName: string
    skuCategory: string | null
  }>
> = {
  SAG: [
    {
      id: 'sku-sag-fitout',
      skuCode: 'SAG-FITOUT-COM',
      skuName: 'Commercial Fit-Out',
      skuCategory: 'Interior',
    },
    {
      id: 'sku-sag-pm',
      skuCode: 'SAG-PM',
      skuName: 'Project Management Services',
      skuCategory: 'Services',
    },
  ],
  STARKEN_DRYMIX: [
    {
      id: 'sku-drymix-render',
      skuCode: 'DRYMIX-RENDER',
      skuName: 'Exterior Render',
      skuCategory: 'Drymix',
    },
    {
      id: 'sku-drymix-skim',
      skuCode: 'DRYMIX-SKIM',
      skuName: 'Skimcoat',
      skuCategory: 'Drymix',
    },
  ],
  GCAST: [
    {
      id: 'sku-gcast-drain',
      skuCode: 'GCAST-DRAIN',
      skuName: 'Precast Drain',
      skuCategory: 'Infrastructure',
    },
    {
      id: 'sku-gcast-manhole',
      skuCode: 'GCAST-MANHOLE',
      skuName: 'Precast Manhole',
      skuCategory: 'Infrastructure',
    },
  ],
  MAKNA: [
    {
      id: 'sku-makna-db',
      skuCode: 'MAKNA-DB-01',
      skuName: 'Design & Build Package',
      skuCategory: 'Construction',
    },
    {
      id: 'sku-makna-infra',
      skuCode: 'MAKNA-INFRA-01',
      skuName: 'Infrastructure Works Package',
      skuCategory: 'Construction',
    },
  ],
}

async function loadChallengeFixtures(): Promise<ChallengeFixture[]> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const fixturesDir = path.resolve(currentDir, '../../test/fixtures/challenge-examples')
  const entries = await readdir(fixturesDir)
  const fixtureFiles = entries.filter((entry) => entry.endsWith('.json')).sort()

  const fixtures: ChallengeFixture[] = []
  for (const fixtureFile of fixtureFiles) {
    const raw = await readFile(path.join(fixturesDir, fixtureFile), 'utf8')
    fixtures.push(JSON.parse(raw) as ChallengeFixture)
  }

  return fixtures
}

function toRuleSets(fixture: ChallengeFixture): BuRuleSetInput[] {
  return fixture.ruleSets.map((ruleSet) => ({
    businessUnitId: ruleSet.businessUnitId,
    businessUnitCode: ruleSet.businessUnitCode,
    businessUnitName: ruleSet.businessUnitName,
    conditions: ruleSet.conditions.map((condition) => ({
      factKey: condition.factKey,
      operator: condition.operator,
      comparisonValue: condition.comparisonValue ?? null,
      comparisonValues: condition.comparisonValues ?? null,
      weight: condition.weight,
      isRequired: condition.isRequired,
    })),
  }))
}

describe('challenge acceptance fixtures', () => {
  it('satisfies normalization, ranking, and orchestration expectations', async () => {
    const fixtures = await loadChallengeFixtures()
    expect(fixtures.length).toBeGreaterThan(0)

    for (const fixture of fixtures) {
      const facts = normalizeToLeadFacts(fixture.rawExtraction)
      const factPairs = new Set(facts.map((fact) => `${fact.factKey}:${fact.factValue}`))

      for (const expectedFact of fixture.expected.factsInclude) {
        expect(factPairs.has(expectedFact), `${fixture.id} missing ${expectedFact}`).toBe(true)
      }

      const scores = scoreBusinessUnitsDeterministically(facts, toRuleSets(fixture))
      const ranked = rankDeterministicBuScores(scores, {
        maxCrossSell: 2,
        minCrossSellScore: 0.2,
      })

      expect(ranked.length, `${fixture.id} should produce rankings`).toBeGreaterThan(0)
      expect(ranked[0].role).toBe('PRIMARY')
      expect(ranked[0].businessUnitCode).toBe(fixture.expected.primaryBusinessUnitCode)

      for (const crossSellCode of fixture.expected.crossSellBusinessUnitCodes) {
        const hasExpectedCrossSell = ranked.some(
          (item) =>
            item.businessUnitCode === crossSellCode &&
            item.role === ('CROSS_SELL' satisfies RecommendationRole),
        )
        expect(hasExpectedCrossSell, `${fixture.id} missing cross-sell ${crossSellCode}`).toBe(
          true,
        )
      }

      const primarySkus = SKU_FIXTURE_BY_BU_CODE[ranked[0].businessUnitCode] ?? []
      const orchestration = await orchestrateBuRecommendation(
        {
          businessUnitId: ranked[0].businessUnitId,
          businessUnitCode: ranked[0].businessUnitCode,
          businessUnitName: ranked[0].businessUnitName,
          role: ranked[0].role,
          finalScore: ranked[0].finalScore,
          confidence: ranked[0].confidence,
          deterministicReason: ranked[0].reasonSummary,
          availableSkus: primarySkus,
        },
        facts,
        {
          runLangChainConversation: async () => null,
        },
      )

      expect(orchestration.summary.length, `${fixture.id} should have explanation`).toBeGreaterThan(
        20,
      )
      expect(orchestration.agentMessages.length).toBeGreaterThanOrEqual(2)
      if (primarySkus.length > 0) {
        expect(orchestration.skuProposals.length).toBeGreaterThan(0)
      }
    }
  })
})
