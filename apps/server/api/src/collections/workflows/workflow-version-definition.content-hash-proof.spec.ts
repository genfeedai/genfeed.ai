import { createHash } from 'node:crypto';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import { buildVisualProjectWorkflowDefinition } from '@api/collections/visual-projects/services/visual-project-workflow-definition';
import { SystemWorkflowDefinitionRegistrarService } from '@api/collections/workflows/services/system-workflow-definition-registrar.service';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  buildWorkflowVersionDefinition,
  createVersionedWorkflow,
  type WorkflowDefinitionInput,
} from '@api/collections/workflows/workflow-version-definition';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { collectSystemWorkflowDefinitions } from '@api/shared/testing/system-workflow-definition-discovery';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/collections/workflows/workflow-version-definition', async () => {
  const actual = await vi.importActual<
    typeof import('@api/collections/workflows/workflow-version-definition')
  >('@api/collections/workflows/workflow-version-definition');
  return {
    ...actual,
    createVersionedWorkflow: vi.fn(actual.createVersionedWorkflow),
  };
});

/**
 * FROZEN reference: the pre-#5912 local serializer of
 * workflow-version-definition.ts, byte for byte. A nested `undefined` becomes
 * the literal text `undefined`. Never edit this to match the shared helper;
 * the point is to prove the shared helper reproduces the persisted contentHash
 * for every code-authored definition.
 */
function frozenStableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => frozenStableStringify(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${frozenStableStringify(record[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) as string;
}

function frozenContentHash(built: {
  graph: unknown;
  inputSchema: unknown;
}): string {
  return `sha256:v1:${createHash('sha256')
    .update(
      frozenStableStringify({
        graph: built.graph,
        inputSchema: built.inputSchema,
      }),
    )
    .digest('hex')}`;
}

function expectSameHash(label: string, input: WorkflowDefinitionInput): void {
  const built = buildWorkflowVersionDefinition(input);
  expect(built.contentHash, label).toBe(frozenContentHash(built));
}

describe('workflow contentHash byte-identity with the pre-#5912 serializer', () => {
  it('matches for every registered system workflow definition', async () => {
    const discovered = await collectSystemWorkflowDefinitions();
    const registered: SystemWorkflowGraphDefinition[] = [];
    new SystemWorkflowDefinitionRegistrarService({
      registerWorkflow: (definition: SystemWorkflowGraphDefinition) => {
        registered.push(definition);
      },
    } as unknown as SystemWorkflowRunnerService).onModuleInit();
    const definitions = new Map(
      [...discovered, ...registered].map((definition) => [
        definition.canonicalId,
        definition,
      ]),
    );

    // Guards the sweep itself: it must not shrink silently.
    expect(definitions.size).toBeGreaterThan(30);
    for (const definition of definitions.values()) {
      expectSameHash(definition.canonicalId, definition.definition);
    }
  }, 120_000);

  it('matches for the visual-project definition', () => {
    expectSameHash(
      'visual-code.execute',
      buildVisualProjectWorkflowDefinition().definition,
    );
  });

  it.each([
    ['post', null],
    ['post', 'credential-1'],
    ['newsletter', null],
    ['image', null],
  ] as const)(
    'matches for the default recurring %s definition (credential %s)',
    async (contentType, credentialId) => {
      const create = vi.mocked(createVersionedWorkflow);
      create.mockClear();
      const service = new DefaultRecurringContentService(
        {} as PrismaService,
        { debug: vi.fn(), log: vi.fn() } as unknown as LoggerService,
        {} as ModuleRef,
      );
      const tx = {
        workflow: {
          create: async () => ({
            id: 'wf-1',
            organizationId: 'org',
            userId: 'u',
          }),
          findFirstOrThrow: async () => ({ id: 'wf-1' }),
        },
        workflowVersion: { create: async () => ({}) },
      };

      await (
        service as unknown as {
          createDefaultRecurringWorkflow: (params: unknown) => Promise<void>;
        }
      ).createDefaultRecurringWorkflow({
        brand: {
          id: 'brand-1',
          label: 'Brand',
          agentConfig: null,
        } as unknown as BrandDocument,
        contentType,
        credentialId,
        organizationId: 'org',
        origin: 'system',
        tx: tx as unknown as PrismaTransactionClient,
        userId: 'user',
      });

      const definitionInput = create.mock.calls[0]?.[2];
      expect(definitionInput).toBeDefined();
      expectSameHash(
        `default-recurring:${contentType}`,
        definitionInput as WorkflowDefinitionInput,
      );
    },
  );
});
