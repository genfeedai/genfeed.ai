vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import type { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

interface Campaign extends Row {
  agentIds: string[];
  id: string;
}

interface Database {
  brands: Row[];
  campaigns: Campaign[];
  strategies: Row[];
}

interface Relation {
  connect?: { id: string }[];
  set?: { id: string }[];
}

const template = {
  brandId: 'brand-1',
  label: 'Creator Studio Program',
  organizationId: 'org-1',
  startDate: new Date('2026-08-20'),
  templateId: 'creator-studio',
  userId: 'user-1',
};

// Prisma filters as Postgres applies them to these rows.
const matches = (row: Row, where: Where): boolean =>
  Object.entries(where).every(([key, condition]) =>
    condition && typeof condition === 'object' && 'in' in condition
      ? (condition.in as unknown[]).includes(row[key])
      : row[key] === condition,
  );

describe('AgentCampaignsService tenant boundaries', () => {
  let db: Database;
  let failStrategyNumber: number | undefined;
  let service: AgentCampaignsService;

  const campaign = () => db.campaigns[0];
  const seedCampaign = (fields: Partial<Campaign> = {}) => {
    db.campaigns.push({
      agentIds: ['agent-1'],
      brandId: 'brand-1',
      campaignLeadStrategyId: 'agent-1',
      config: {},
      id: 'program-1',
      isDeleted: false,
      organizationId: 'org-1',
      status: 'active',
      ...fields,
    });
  };

  beforeEach(() => {
    db = {
      brands: [
        { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
        { id: 'brand-2', isDeleted: false, organizationId: 'org-1' },
        { id: 'foreign-brand', isDeleted: false, organizationId: 'org-2' },
      ],
      campaigns: [],
      strategies: [
        {
          brandId: 'brand-1',
          id: 'agent-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
        {
          brandId: 'brand-2',
          id: 'other-brand-agent',
          isDeleted: false,
          organizationId: 'org-1',
        },
        {
          brandId: 'foreign-brand',
          id: 'foreign-agent',
          isDeleted: false,
          organizationId: 'org-2',
        },
      ],
    };
    failStrategyNumber = undefined;

    const withAgents = (row: Campaign) => {
      const { agentIds, ...rest } = row;
      return { ...rest, agents: agentIds.map((id) => ({ id })) };
    };
    const linked = (relation: unknown, current: string[]) => {
      const { connect, set } = (relation ?? {}) as Relation;
      if (set) return set.map(({ id }) => id);
      return [...current, ...(connect ?? []).map(({ id }) => id)];
    };
    const client = {
      agentCampaign: {
        create: async ({ data }: { data: Row }) => {
          const { agents, ...fields } = data;
          const row = {
            ...fields,
            agentIds: linked(agents, []),
            id: `program-${db.campaigns.length + 1}`,
            isDeleted: false,
          };
          db.campaigns.push(row);
          return withAgents(row);
        },
        findFirst: async ({ where }: { where: Where }) => {
          const row = db.campaigns.find((candidate) =>
            matches(candidate, where),
          );
          return row ? withAgents(row) : null;
        },
        update: async ({ data, where }: { data: Row; where: Where }) => {
          const row = db.campaigns.find((candidate) =>
            matches(candidate, where),
          );
          if (!row)
            throw Object.assign(new Error('Not found'), { code: 'P2025' });
          const { agents, ...fields } = data;
          Object.assign(row, fields, {
            agentIds: linked(agents, row.agentIds),
          });
          return withAgents(row);
        },
      },
      agentStrategy: {
        findMany: async ({ where }: { where: Where }) =>
          db.strategies.filter((row) => matches(row, where)),
      },
      brand: {
        findFirst: async ({ where }: { where: Where }) =>
          db.brands.find((row) => matches(row, where)) ?? null,
      },
    };
    const prisma = {
      ...client,
      // One transaction: a throw rolls back every write made inside it.
      $transaction: async (work: (tx: typeof client) => Promise<unknown>) => {
        const snapshot = structuredClone(db);
        try {
          return await work(client);
        } catch (error) {
          db = snapshot;
          throw error;
        }
      },
    };
    const strategies = {
      createWithClient: async (input: Row) => {
        const number = db.strategies.length - 2;
        if (number === failStrategyNumber)
          throw new Error('Agent write failed');
        const row = {
          ...input,
          id: `created-agent-${number}`,
          isDeleted: false,
        };
        db.strategies.push(row);
        return row;
      },
    };

    service = new AgentCampaignsService(
      prisma as unknown as PrismaService,
      {
        debug: () => undefined,
        error: () => undefined,
        log: () => undefined,
        warn: () => undefined,
      } as unknown as LoggerService,
      strategies as unknown as AgentStrategiesService,
    );
  });

  describe('createFromTemplate', () => {
    it('creates inert template agents and a draft Program led by the first', async () => {
      const result = await service.createFromTemplate(template);

      const created = [
        'created-agent-1',
        'created-agent-2',
        'created-agent-3',
        'created-agent-4',
      ];
      expect(result.agents).toEqual(created);
      expect(db.strategies.slice(3)).toEqual(
        created.map((id) =>
          expect.objectContaining({
            brandId: 'brand-1',
            id,
            isActive: false,
            organizationId: 'org-1',
          }),
        ),
      );
      expect(db.strategies.slice(3)).not.toContainEqual(
        expect.objectContaining({ nextRunAt: expect.anything() }),
      );
      expect(campaign()).toMatchObject({
        agentIds: created,
        brandId: 'brand-1',
        campaignLeadStrategyId: 'created-agent-1',
        organizationId: 'org-1',
        status: 'draft',
        userId: 'user-1',
      });
    });

    it('attaches existing brand agents ahead of the template agents', async () => {
      await service.createFromTemplate({
        ...template,
        agentStrategyIds: ['agent-1'],
      });

      expect(campaign()?.agentIds).toEqual([
        'agent-1',
        'created-agent-1',
        'created-agent-2',
        'created-agent-3',
        'created-agent-4',
      ]);
    });

    it('leaves no orphan agents when a later agent cannot be written', async () => {
      failStrategyNumber = 3;

      await expect(service.createFromTemplate(template)).rejects.toThrow(
        'Agent write failed',
      );
      expect(db.strategies.map(({ id }) => id)).toEqual([
        'agent-1',
        'other-brand-agent',
        'foreign-agent',
      ]);
      expect(db.campaigns).toEqual([]);
    });

    it.each([
      ['a brand of another organization', { brandId: 'foreign-brand' }],
      [
        'an agent of another organization',
        { agentStrategyIds: ['agent-1', 'foreign-agent'] },
      ],
      [
        'an agent of another brand',
        { agentStrategyIds: ['other-brand-agent'] },
      ],
    ])('refuses %s before writing', async (_case, fields) => {
      await expect(
        service.createFromTemplate({ ...template, ...fields }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.strategies).toHaveLength(3);
      expect(db.campaigns).toEqual([]);
    });
    it('refuses an unknown template before writing', () => {
      expect(() =>
        service.createFromTemplate({ ...template, templateId: 'missing' }),
      ).toThrow('Unknown Program template');
      expect(db.campaigns).toEqual([]);
    });
  });

  describe('patch', () => {
    it('refuses a lead that is not attached to the Program', async () => {
      seedCampaign();

      await expect(
        service.patch('program-1', {
          campaignLeadStrategyId: 'foreign-agent',
          organizationId: 'org-1',
        }),
      ).rejects.toThrow('The Program lead must be attached to the Program');
      expect(campaign()?.campaignLeadStrategyId).toBe('agent-1');
    });

    it('allows a routine status update while an attached agent is gone', async () => {
      seedCampaign({
        agentIds: ['deleted-agent'],
        campaignLeadStrategyId: 'deleted-agent',
      });

      await expect(
        service.patch('program-1', {
          organizationId: 'org-1',
          status: 'completed',
        }),
      ).resolves.toMatchObject({
        agents: ['deleted-agent'],
        status: 'completed',
      });
      expect(campaign()?.status).toBe('completed');
    });

    it('replaces the attached agents when they all belong to the brand', async () => {
      seedCampaign({ agentIds: [], campaignLeadStrategyId: null });
      db.strategies.push({
        brandId: 'brand-1',
        id: 'agent-2',
        isDeleted: false,
        organizationId: 'org-1',
      });

      await service.patch('program-1', {
        agentStrategyIds: ['agent-1', 'agent-2'],
        campaignLeadStrategyId: 'agent-2',
        organizationId: 'org-1',
      });

      expect(campaign()).toMatchObject({
        agentIds: ['agent-1', 'agent-2'],
        campaignLeadStrategyId: 'agent-2',
      });
    });

    it('refuses an update without an organization scope', async () => {
      seedCampaign();

      await expect(
        service.patch('program-1', { status: 'completed' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(campaign()?.status).toBe('active');
    });

    it("does not find another organization's Program", async () => {
      seedCampaign({ organizationId: 'org-2' });

      await expect(
        service.patch('program-1', {
          organizationId: 'org-1',
          status: 'completed',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(campaign()?.status).toBe('active');
    });
  });
});
