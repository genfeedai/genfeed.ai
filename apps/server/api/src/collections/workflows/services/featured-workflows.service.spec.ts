import { FeaturedWorkflowsService } from '@api/collections/workflows/services/featured-workflows.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  FEATURED_WORKFLOW_LIMIT,
} from '@genfeedai/contracts/constants';
import { isCrossOrgUnsafe } from '@libs/prisma/tenant-context';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type WorkflowRowInput = {
  id: string;
  label?: string | null;
  organizationId?: string;
};

/** A source row carrying everything a tenant workflow can hold. */
function workflowRow({
  id,
  label = `Workflow ${id}`,
  organizationId = 'source-org',
}: WorkflowRowInput) {
  return {
    brandId: 'source-brand',
    config: { webhookId: 'hook-1', webhookSecret: 'shh' },
    currentVersion: {
      graph: {
        edgeStyle: 'smoothstep',
        edges: [
          {
            animated: true,
            id: 'e-1',
            source: 'draft',
            sourceHandle: 'text',
            target: 'publish',
          },
        ],
        lockedNodeIds: ['draft'],
        nodes: [
          {
            data: {
              cachedOutput: 'source org customer copy',
              config: {
                actionId: 'postGen',
                brandId: 'source-brand',
                credentialId: 'source-credential',
                prompt: 'Write a thread about {{topic}}',
              },
              label: 'Draft',
            },
            id: 'draft',
            position: { x: 10, y: 20 },
            selected: true,
            type: 'genfeedAction',
          },
        ],
      },
      id: `${id}-v1`,
      inputSchema: [
        { key: 'topic', label: 'Topic', required: true, type: 'text' },
      ],
      version: 1,
    },
    currentVersionId: `${id}-v1`,
    defaultRecurringBrandId: 'source-brand',
    description: 'A curated workflow',
    executionCount: 42,
    id,
    isDeleted: false,
    label,
    metadata: null,
    organizationId,
    schedule: '0 9 * * *',
    thumbnail: `https://cdn.example/${id}.png`,
    userId: 'source-user',
  };
}

describe('FeaturedWorkflowsService (#5511)', () => {
  const findMany = vi.fn();
  let storedPins: string[];
  let cachedPins: string[];
  const platformSettingsService = {
    getFeatureSettings: vi.fn(async () => ({
      ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
      featuredWorkflowIds: cachedPins,
    })),
    getSingleton: vi.fn(async () => ({ featuredWorkflowIds: storedPins })),
    updateFeaturedWorkflowIds: vi.fn(
      async (
        resolveNext: (current: readonly string[]) => Promise<readonly string[]>,
      ) => {
        storedPins = [...(await resolveNext(storedPins))];
        return storedPins;
      },
    ),
  };

  let service: FeaturedWorkflowsService;

  /** Rows the database holds: non-deleted, non-system workflows by id. */
  function givenWorkflows(rows: ReturnType<typeof workflowRow>[]) {
    findMany.mockImplementation(
      async (args: { where: { id: { in: string[] } } }) =>
        rows.filter((row) => args.where.id.in.includes(row.id)),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    storedPins = [];
    cachedPins = [];
    service = new FeaturedWorkflowsService(
      { workflow: { findMany } } as never,
      platformSettingsService as never,
    );
  });

  describe('listFeatured', () => {
    it('is empty without a query when nothing is pinned', async () => {
      await expect(service.listFeatured()).resolves.toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('returns pinned workflows in pin order with ranks, in one query', async () => {
      cachedPins = ['wf-b', 'wf-gone', 'wf-a'];
      givenWorkflows([
        workflowRow({ id: 'wf-a' }),
        workflowRow({ id: 'wf-b' }),
      ]);

      const featured = await service.listFeatured();

      expect(
        featured.map((workflow) => [workflow.id, workflow.featuredRank]),
      ).toEqual([
        ['wf-b', 1],
        ['wf-a', 2],
      ]);
      expect(findMany).toHaveBeenCalledTimes(1);
    });

    it('reads across organizations only through the named hatch, excluding deleted and system rows', async () => {
      cachedPins = ['wf-a'];
      let isHatchOpen = false;
      findMany.mockImplementation(async () => {
        isHatchOpen = isCrossOrgUnsafe();
        return [workflowRow({ id: 'wf-a' })];
      });

      await service.listFeatured();

      expect(isHatchOpen).toBe(true);
      const [args] = findMany.mock.calls[0] ?? [];
      expect(args.where).toMatchObject({
        id: { in: ['wf-a'] },
        isDeleted: false,
      });
      expect(args.where.AND).toBeDefined();
    });

    it('exposes only display fields and the graph, with source-org bindings blanked', async () => {
      cachedPins = ['wf-a'];
      givenWorkflows([workflowRow({ id: 'wf-a' })]);

      const [featured] = await service.listFeatured();

      expect(featured).toEqual({
        description: 'A curated workflow',
        edgeStyle: 'smoothstep',
        edges: [
          {
            id: 'e-1',
            source: 'draft',
            sourceHandle: 'text',
            target: 'publish',
          },
        ],
        featuredRank: 1,
        id: 'wf-a',
        inputVariables: [
          { key: 'topic', label: 'Topic', required: true, type: 'text' },
        ],
        label: 'Workflow wf-a',
        nodes: [
          {
            data: {
              config: {
                actionId: 'postGen',
                brandId: '',
                credentialId: '',
                prompt: 'Write a thread about {{topic}}',
              },
              label: 'Draft',
            },
            id: 'draft',
            position: { x: 10, y: 20 },
            type: 'genfeedAction',
          },
        ],
        thumbnail: 'https://cdn.example/wf-a.png',
      });
      const serialized = JSON.stringify(featured);
      for (const sourceValue of [
        'source-org',
        'source-user',
        'source-brand',
        'source-credential',
        'shh',
        'source org customer copy',
      ]) {
        expect(serialized).not.toContain(sourceValue);
      }
    });
  });

  describe('findFeatured', () => {
    it('returns a pinned workflow', async () => {
      cachedPins = ['wf-a'];
      givenWorkflows([workflowRow({ id: 'wf-a' })]);

      await expect(service.findFeatured('wf-a')).resolves.toMatchObject({
        id: 'wf-a',
      });
    });

    it('404s for a workflow that exists but is not pinned', async () => {
      cachedPins = ['wf-a'];
      givenWorkflows([
        workflowRow({ id: 'wf-a' }),
        workflowRow({ id: 'wf-b' }),
      ]);

      await expect(service.findFeatured('wf-b')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('pin', () => {
    it('appends an eligible workflow and returns summaries in pin order', async () => {
      storedPins = ['wf-a'];
      givenWorkflows([
        workflowRow({ id: 'wf-a' }),
        workflowRow({ id: 'wf-b' }),
      ]);

      await expect(service.pin('wf-b')).resolves.toEqual([
        {
          description: 'A curated workflow',
          featuredRank: 1,
          id: 'wf-a',
          label: 'Workflow wf-a',
          thumbnail: 'https://cdn.example/wf-a.png',
        },
        {
          description: 'A curated workflow',
          featuredRank: 2,
          id: 'wf-b',
          label: 'Workflow wf-b',
          thumbnail: 'https://cdn.example/wf-b.png',
        },
      ]);
      expect(storedPins).toEqual(['wf-a', 'wf-b']);
    });

    it('pins a workflow from any organization', async () => {
      givenWorkflows([
        workflowRow({ id: 'wf-x', organizationId: 'other-org' }),
      ]);

      await service.pin('wf-x');

      expect(storedPins).toEqual(['wf-x']);
    });

    it('is idempotent for a pinned workflow', async () => {
      storedPins = ['wf-a', 'wf-b'];
      givenWorkflows([
        workflowRow({ id: 'wf-a' }),
        workflowRow({ id: 'wf-b' }),
      ]);

      await service.pin('wf-a');

      expect(storedPins).toEqual(['wf-a', 'wf-b']);
    });

    it('404s for a missing, deleted or system workflow and stores nothing', async () => {
      storedPins = ['wf-a'];
      givenWorkflows([workflowRow({ id: 'wf-a' })]);

      await expect(service.pin('wf-missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(storedPins).toEqual(['wf-a']);
    });

    it('drops pins whose workflow was deleted since', async () => {
      storedPins = ['wf-gone', 'wf-a'];
      givenWorkflows([
        workflowRow({ id: 'wf-a' }),
        workflowRow({ id: 'wf-b' }),
      ]);

      await service.pin('wf-b');

      expect(storedPins).toEqual(['wf-a', 'wf-b']);
    });

    it(`refuses a pin beyond ${FEATURED_WORKFLOW_LIMIT}`, async () => {
      const rows = Array.from({ length: FEATURED_WORKFLOW_LIMIT + 1 }, (_, i) =>
        workflowRow({ id: `wf-${i}` }),
      );
      storedPins = rows.slice(0, FEATURED_WORKFLOW_LIMIT).map((row) => row.id);
      givenWorkflows(rows);

      await expect(
        service.pin(`wf-${FEATURED_WORKFLOW_LIMIT}`),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storedPins).toHaveLength(FEATURED_WORKFLOW_LIMIT);
    });
  });

  describe('unpin', () => {
    it('removes the workflow and keeps the order of the rest', async () => {
      storedPins = ['wf-a', 'wf-b', 'wf-c'];
      givenWorkflows(['wf-a', 'wf-b', 'wf-c'].map((id) => workflowRow({ id })));

      const pins = await service.unpin('wf-b');

      expect(storedPins).toEqual(['wf-a', 'wf-c']);
      expect(pins.map((pin) => [pin.id, pin.featuredRank])).toEqual([
        ['wf-a', 1],
        ['wf-c', 2],
      ]);
    });

    it('unpins a workflow deleted after it was pinned', async () => {
      storedPins = ['wf-gone', 'wf-a'];
      givenWorkflows([workflowRow({ id: 'wf-a' })]);

      await service.unpin('wf-gone');

      expect(storedPins).toEqual(['wf-a']);
    });
  });

  describe('reorder', () => {
    it('stores the new order', async () => {
      storedPins = ['wf-a', 'wf-b', 'wf-c'];
      givenWorkflows(['wf-a', 'wf-b', 'wf-c'].map((id) => workflowRow({ id })));

      const pins = await service.reorder(['wf-c', 'wf-a', 'wf-b']);

      expect(storedPins).toEqual(['wf-c', 'wf-a', 'wf-b']);
      expect(pins.map((pin) => pin.id)).toEqual(['wf-c', 'wf-a', 'wf-b']);
    });

    it.each([
      ['a missing pin', ['wf-a', 'wf-b']],
      ['an unpinned workflow', ['wf-a', 'wf-b', 'wf-c', 'wf-d']],
      ['a duplicate', ['wf-a', 'wf-a', 'wf-b']],
    ])('refuses an order with %s as stale (409)', async (_, order) => {
      storedPins = ['wf-a', 'wf-b', 'wf-c'];
      givenWorkflows(
        ['wf-a', 'wf-b', 'wf-c', 'wf-d'].map((id) => workflowRow({ id })),
      );

      await expect(service.reorder(order)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(storedPins).toEqual(['wf-a', 'wf-b', 'wf-c']);
    });
  });

  describe('listPinned', () => {
    it('reads the stored pins, not the cached copy', async () => {
      storedPins = ['wf-a'];
      cachedPins = [];
      givenWorkflows([workflowRow({ id: 'wf-a' })]);

      await expect(service.listPinned()).resolves.toEqual([
        expect.objectContaining({ featuredRank: 1, id: 'wf-a' }),
      ]);
      expect(platformSettingsService.getFeatureSettings).not.toHaveBeenCalled();
    });
  });
});
