/**
 * Guard: every domain enum that shares a name with a Prisma column enum must
 * use the Prisma label as its value (SCREAMING_SNAKE). This is the class of
 * bug that made `status: "pending"` fail at runtime while TypeScript stayed silent.
 *
 * Scoped to enums already harmonized on trunk plus this PR's targets.
 * Expand when additional dual-case enums are flipped.
 *
 * @see .claude/rules/enum_source_of_truth.md
 * @see packages/prisma/prisma/schema.prisma
 */
import { describe, expect, it } from 'vitest';
import {
  AgentRunStatus,
  BatchStatus,
  ByokBillingStatus,
  IngredientStatus,
  SubscriptionStatus,
  TrainingStage,
  WorkflowExecutionStatus,
} from '../src';

/** Prisma labels that MUST appear as domain enum values (extras allowed). */
const PRISMA_REQUIRED: Record<string, readonly string[]> = {
  AgentRunStatus: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'],
  BatchStatus: [
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'PARTIAL',
    'FAILED',
    'CANCELLED',
  ],
  ByokBillingStatus: ['ACTIVE', 'PAST_DUE', 'SUSPENDED'],
  IngredientStatus: [
    'DRAFT',
    'PROCESSING',
    'UPLOADED',
    'GENERATED',
    'VALIDATED',
    'FAILED',
    'ARCHIVED',
    'REJECTED',
  ],
  SubscriptionStatus: [
    'ACTIVE',
    'CANCELLED',
    'PAST_DUE',
    'TRIALING',
    'INCOMPLETE',
  ],
  TrainingStage: [
    'PENDING',
    'UPLOADING',
    'TRAINING',
    'READY',
    'FAILED',
    'CANCELLED',
  ],
  WorkflowExecutionStatus: [
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
  ],
};

const DOMAIN_ENUMS: Record<string, Record<string, string>> = {
  AgentRunStatus,
  BatchStatus,
  ByokBillingStatus,
  IngredientStatus,
  SubscriptionStatus,
  TrainingStage,
  WorkflowExecutionStatus,
};

describe('prisma-parity (domain enum values === Prisma labels)', () => {
  for (const [name, required] of Object.entries(PRISMA_REQUIRED)) {
    it(`${name} includes every Prisma label as a value`, () => {
      const domain = DOMAIN_ENUMS[name];
      expect(domain, `missing domain export ${name}`).toBeDefined();
      const values = new Set(Object.values(domain));
      for (const label of required) {
        expect(values.has(label), `${name} missing value ${label}`).toBe(true);
      }
    });
  }

  it('domain enum values for Prisma-backed enums are SCREAMING_SNAKE', () => {
    for (const [name, required] of Object.entries(PRISMA_REQUIRED)) {
      for (const label of required) {
        expect(label).toMatch(/^[A-Z][A-Z0-9_]*$/);
        expect(DOMAIN_ENUMS[name]).toBeDefined();
      }
    }
  });
});
