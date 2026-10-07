import {
  AUTOMATION_CHILD_WORKFLOWS,
  AUTOMATION_WORKFLOW_IDS,
} from '@api/collections/workflows/services/automation-workflow-definitions';
import { ContentProductionWorkflowService } from '@api/collections/workflows/services/content-production-workflow.service';
import { getActionDefinition } from '@genfeedai/actions';
import { PersonaContentFormat } from '@genfeedai/contracts';
import {
  buildActionExecutionInput,
  compileActionContract,
} from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

describe('ContentProductionWorkflowService.discoverContentPipelinePersonas', () => {
  it('emits discovery output the closed contract accepts, with and without the lock', async () => {
    const prisma = {
      persona: {
        findMany: vi.fn().mockResolvedValue([
          {
            _count: { credentials: 1 },
            brandId: null,
            config: {},
            id: 'persona-1',
            label: 'Founder',
            organizationId: 'org-1',
            userId: 'user-1',
          },
        ]),
      },
    };
    const service = new ContentProductionWorkflowService(
      {} as never,
      {} as never,
      {} as never,
      prisma as never,
      {} as never,
      {} as never,
    );
    const action = getActionDefinition(
      'content.production.autopilot.discover-personas',
    );
    const contract = compileActionContract(
      'content.production.autopilot.discover-personas',
      {
        inputSchema: (action?.inputSchema ?? {}) as Readonly<
          Record<string, unknown>
        >,
        outputSchema: (action?.outputSchema ?? {}) as Readonly<
          Record<string, unknown>
        >,
      },
    );
    const provenance = {
      nodeId: 'discover-personas',
      runId: 'run',
      workflowId: 'workflow',
      workflowVersionId: 'v1',
    };

    const acquired = await service.discoverContentPipelinePersonas('org-1', {
      state: { acquired: true },
    });
    const unacquired = await service.discoverContentPipelinePersonas('org-1', {
      state: { acquired: false },
    });

    expect(acquired.items).toHaveLength(1);
    expect(unacquired).toEqual({
      baseInput: { organizationId: 'org-1' },
      items: [],
    });
    expect(() => contract.validateOutput(acquired, provenance)).not.toThrow();
    expect(() => contract.validateOutput(unacquired, provenance)).not.toThrow();
  });
});

describe('ContentProductionWorkflowService atomic actions', () => {
  function buildService() {
    const contentExecution = {
      executeSingleItem: vi.fn().mockResolvedValue({ status: 'COMPLETED' }),
      finalizePlanExecution: vi.fn().mockResolvedValue({
        results: [],
        summary: { completed: 0, failed: 0, total: 0 },
      }),
      preparePlanExecution: vi.fn().mockResolvedValue({
        baseInput: {},
        items: [],
        planId: 'plan-1',
      }),
    };
    const measurements = vi.fn().mockResolvedValue([]);
    return {
      measurements,
      contentExecution,
      service: new ContentProductionWorkflowService(
        {} as never,
        {} as never,
        contentExecution as never,
        { contentPerformance: { findMany: measurements } } as never,
        {} as never,
        {} as never,
      ),
    };
  }

  it('selects a configured topic using only measured persona evidence', async () => {
    const { service, measurements } = buildService();
    measurements.mockResolvedValue([
      {
        postId: 'post-1',
        data: { promptUsed: 'Metrics that matter' },
        performanceScore: 80,
      },
    ]);
    const result = await service.prepareContentPipelinePersona({
      item: {
        id: 'persona-1',
        organizationId: 'org-1',
        brandId: 'brand-1',
        userId: 'user-1',
        label: 'Founder',
        credentialCount: 1,
        config: {
          profileImageUrl: 'https://example.com/profile.png',
          contentStrategy: {
            topics: ['shipping', 'metrics'],
            formats: [PersonaContentFormat.PHOTO],
          },
        },
      },
      now: '2026-09-24T00:00:00.000Z',
    });
    expect(measurements).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          brandId: 'brand-1',
          post: expect.objectContaining({
            personaId: 'persona-1',
            organizationId: 'org-1',
            isDeleted: false,
          }),
        }),
      }),
    );
    expect(result.imageItems).toEqual([
      expect.objectContaining({
        prompt: expect.stringContaining(
          'metrics. Observed feedback: 1 prior posts',
        ),
      }),
    ]);
  });

  it.each([
    [PersonaContentFormat.PHOTO, 'imageItems'],
    [PersonaContentFormat.AUDIO, 'musicItems'],
    [PersonaContentFormat.VIDEO, 'videoItems'],
  ])(
    'routes %s through one typed child-workflow collection',
    async (format, key) => {
      const { service } = buildService();
      const result = await service.prepareContentPipelinePersona({
        item: {
          brandId: 'brand-1',
          config: {
            contentStrategy: { formats: [format], topics: ['shipping'] },
            profileImageUrl: 'https://cdn.example.com/persona.png',
          },
          credentials: [{ id: 'credential-1' }],
          id: 'persona-1',
          label: 'Founder',
          organizationId: 'org-1',
          userId: 'user-1',
        },
        now: '2026-08-28T00:00:00.000Z',
      });

      expect(result[key]).toHaveLength(1);
      expect(
        ['imageItems', 'musicItems', 'videoItems']
          .filter((candidate) => candidate !== key)
          .every(
            (candidate) =>
              Array.isArray(result[candidate]) &&
              (result[candidate] as unknown[]).length === 0,
          ),
      ).toBe(true);
    },
  );

  it.each([
    [
      PersonaContentFormat.PHOTO,
      'imageItems',
      AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE_IMAGE,
    ],
    [
      PersonaContentFormat.AUDIO,
      'musicItems',
      AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE_MUSIC,
    ],
    [
      PersonaContentFormat.VIDEO,
      'videoItems',
      AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE_VIDEO,
    ],
  ])(
    'delivers a prepared %s request every typed pipeline contract accepts',
    async (format, key, canonicalId) => {
      const { service } = buildService();
      const prepared = await service.prepareContentPipelinePersona({
        item: {
          brandId: 'brand-1',
          config: {
            contentStrategy: { formats: [format], topics: ['shipping'] },
            profileImageUrl: 'https://cdn.example.com/persona.png',
          },
          credentialCount: 1,
          id: 'persona-1',
          label: 'Founder',
          organizationId: 'org-1',
          userId: 'user-1',
        },
        now: '2026-08-28T00:00:00.000Z',
      });
      const [request] = prepared[key] as Record<string, unknown>[];
      const workflow = AUTOMATION_CHILD_WORKFLOWS.find(
        (definition) => definition.canonicalId === canonicalId,
      );
      const edgeValues: Record<string, unknown> = {
        pipelineContext: { hasCredentials: true },
        stepOutcome0: {
          ingredientId: 'ingredient-1',
          result: { contentType: 'image/png', url: 'https://cdn/x.png' },
          step: request?.step,
          stepIndex: 0,
          timingMs: 1,
        },
      };

      expect(request).toBeDefined();
      expect(workflow?.definition.nodes).toHaveLength(3);
      for (const node of workflow?.definition.nodes ?? []) {
        const config = node.data.config as Record<string, unknown>;
        const actionId = String(config.actionId);
        const action = getActionDefinition(actionId);
        const contract = compileActionContract(actionId, {
          inputSchema: (action?.inputSchema ?? {}) as Readonly<
            Record<string, unknown>
          >,
          outputSchema: (action?.outputSchema ?? {}) as Readonly<
            Record<string, unknown>
          >,
        });
        // Mirrors the converter: the child's `request` input variable is
        // copied onto every node that lists it.
        const inputs = Object.fromEntries(
          (workflow?.definition.edges ?? [])
            .filter((edge) => edge.target === node.id)
            .map((edge) => [
              edge.targetHandle ?? edge.source,
              edgeValues[edge.targetHandle ?? edge.source],
            ]),
        );
        const provenance = {
          nodeId: node.id,
          runId: 'run',
          workflowId: canonicalId,
          workflowVersionId: 'v1',
        };

        expect(() =>
          contract.validateInput(
            buildActionExecutionInput({ ...config, request }, inputs),
            provenance,
          ),
        ).not.toThrow();
        expect(() =>
          contract.validateInput(
            buildActionExecutionInput(
              { ...config, request: { ...request, brandId: undefined } },
              inputs,
            ),
            provenance,
          ),
        ).toThrow(/brandId/);
      }
    },
  );

  it('adapts a planned brand into the plan execution atomic boundary', async () => {
    const { contentExecution, service } = buildService();
    await service.prepareContentEnginePlanExecution('org-1', {
      request: { brandId: 'brand-1', planId: 'plan-1', userId: 'user-1' },
    });

    expect(contentExecution.preparePlanExecution).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'plan-1',
      'user-1',
    );
  });
});
