import {
  AUTONOMOUS_PRODUCER_TEMPLATES,
  AutonomousProducerInstallService,
} from '@api/collections/workflows/autonomous-producers/autonomous-producer-install.service';
import { SYSTEM_WORKFLOW_CATALOG } from '@api/collections/workflows/workflows.tokens';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

const principal = { organizationId: 'org-1', userId: 'user-1' };

interface MemberRow {
  isActive: boolean;
  isDeleted: boolean;
  organizationId: string;
  role: { key: MemberRole };
  userId: string;
}

interface WorkflowRow {
  id: string;
  isDeleted: boolean;
  organizationId: string;
  sourceTemplateId: string;
  status: string;
}

/** Row matches when every `where` field equals the row's value. */
const matches = (row: object, where: Record<string, unknown>) =>
  Object.entries(where).every(
    ([key, value]) => (row as Record<string, unknown>)[key] === value,
  );

function setup(
  options: {
    catalog?: 'available' | 'missing' | 'failing';
    members?: MemberRow[];
    workflows?: WorkflowRow[];
  } = {},
) {
  const members: MemberRow[] = options.members ?? [
    {
      isActive: true,
      isDeleted: false,
      organizationId: 'org-1',
      role: { key: MemberRole.CREATOR },
      userId: 'user-1',
    },
  ];
  const workflows: WorkflowRow[] = options.workflows ?? [];
  const errors: string[] = [];

  const prisma = {
    member: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const member = members.find((row) => matches(row, where));
        return member ? { role: member.role } : null;
      },
    },
    workflow: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const workflow = workflows.find((row) => matches(row, where));
        return workflow ? { id: workflow.id } : null;
      },
    },
  } as unknown as PrismaService;

  const catalog = {
    install: async (input: { canonicalId: string; organizationId: string }) => {
      if (options.catalog === 'failing') throw new Error('scheduler down');
      const row: WorkflowRow = {
        id: `workflow-${workflows.length + 1}`,
        isDeleted: false,
        organizationId: input.organizationId,
        sourceTemplateId: input.canonicalId,
        status: 'active',
      };
      workflows.push(row);
      return { id: row.id };
    },
  };
  const moduleRef = {
    get: (token: symbol) => {
      if (token === SYSTEM_WORKFLOW_CATALOG && options.catalog !== 'missing')
        return catalog;
      throw new Error('not found');
    },
  } as unknown as ModuleRef;
  const logger = {
    error: (message: string) => {
      errors.push(message);
    },
    warn: () => undefined,
  } as unknown as LoggerService;

  const service = new AutonomousProducerInstallService(
    prisma,
    logger,
    moduleRef,
  );
  return { errors, service, workflows };
}

const workflow = (overrides: Partial<WorkflowRow>): WorkflowRow => ({
  id: 'existing',
  isDeleted: false,
  organizationId: 'org-1',
  sourceTemplateId: 'content-engine-production',
  status: 'active',
  ...overrides,
});

describe('AutonomousProducerInstallService', () => {
  it('installs every catalog workflow of the producer the organization opted in to', async () => {
    const s = setup();

    const outcomes = await s.service.installOnOptIn({
      organizationId: 'org-1',
      principal,
      producer: 'campaigns',
    });

    expect(outcomes).toEqual({
      'agent-campaign-orchestration': 'installed',
      'agent-campaign-trigger-evaluation': 'installed',
    });
    expect(s.workflows.map((row) => row.sourceTemplateId)).toEqual([
      ...AUTONOMOUS_PRODUCER_TEMPLATES.campaigns,
    ]);
  });

  it('installs the daily competitor ad research workflow for its producer', async () => {
    const s = setup();

    await expect(
      s.service.installOnOptIn({
        organizationId: 'org-1',
        principal,
        producer: 'paidCreativeResearch',
      }),
    ).resolves.toEqual({ 'paid-creative-research-ingestion': 'installed' });
    expect(s.workflows).toEqual([
      expect.objectContaining({
        organizationId: 'org-1',
        sourceTemplateId: 'paid-creative-research-ingestion',
      }),
    ]);
  });

  it('keeps the install from a previous opt-in instead of adding a second one', async () => {
    const s = setup();
    const input = {
      organizationId: 'org-1',
      principal,
      producer: 'contentEngine' as const,
    };

    await s.service.installOnOptIn(input);
    const again = await s.service.installOnOptIn(input);

    expect(again).toEqual({ 'content-engine-production': 'kept' });
    expect(s.workflows).toHaveLength(1);
  });

  // Soft-deleted and paused installs are tenant controls: an opt-in never
  // re-creates or re-enables them.
  it.each([
    ['a paused', workflow({ status: 'paused' })],
    ['a soft-deleted', workflow({ isDeleted: true })],
  ])('keeps %s install untouched', async (_label, existing) => {
    const s = setup({ workflows: [existing] });

    await expect(
      s.service.installOnOptIn({
        organizationId: 'org-1',
        principal,
        producer: 'contentEngine',
      }),
    ).resolves.toEqual({ 'content-engine-production': 'kept' });
    expect(s.workflows).toEqual([existing]);
  });

  it('ignores another organization install of the same template', async () => {
    const s = setup({
      workflows: [workflow({ organizationId: 'org-2' })],
    });

    await expect(
      s.service.installOnOptIn({
        organizationId: 'org-1',
        principal,
        producer: 'contentEngine',
      }),
    ).resolves.toEqual({ 'content-engine-production': 'installed' });
    expect(s.workflows).toHaveLength(2);
  });

  it.each([
    [
      'a member whose role cannot install catalog workflows',
      { isActive: true, isDeleted: false, role: MemberRole.USER },
    ],
    [
      'an inactive member',
      { isActive: false, isDeleted: false, role: MemberRole.CREATOR },
    ],
    [
      'a removed member',
      { isActive: true, isDeleted: true, role: MemberRole.CREATOR },
    ],
  ])('installs nothing for %s', async (_label, member) => {
    const s = setup({
      members: [
        {
          isActive: member.isActive,
          isDeleted: member.isDeleted,
          organizationId: 'org-1',
          role: { key: member.role },
          userId: 'user-1',
        },
      ],
    });

    await expect(
      s.service.installOnOptIn({
        organizationId: 'org-1',
        principal,
        producer: 'campaigns',
      }),
    ).resolves.toEqual({
      'agent-campaign-orchestration': 'unauthorized',
      'agent-campaign-trigger-evaluation': 'unauthorized',
    });
    expect(s.workflows).toEqual([]);
  });

  it('installs nothing for a member of another organization', async () => {
    const s = setup({
      members: [
        {
          isActive: true,
          isDeleted: false,
          organizationId: 'org-2',
          role: { key: MemberRole.CREATOR },
          userId: 'user-1',
        },
      ],
    });

    await expect(
      s.service.installOnOptIn({
        organizationId: 'org-1',
        principal,
        producer: 'contentEngine',
      }),
    ).resolves.toEqual({ 'content-engine-production': 'unauthorized' });
    expect(s.workflows).toEqual([]);
  });

  it('reports the install as unavailable when the catalog is not loaded', async () => {
    const s = setup({ catalog: 'missing' });

    await expect(
      s.service.installOnOptIn({
        organizationId: 'org-1',
        principal,
        producer: 'contentEngine',
      }),
    ).resolves.toEqual({ 'content-engine-production': 'unavailable' });
    expect(s.workflows).toEqual([]);
  });

  it('never fails the opt-in when the install throws, and logs the failure', async () => {
    const s = setup({ catalog: 'failing' });

    await expect(
      s.service.installOnOptIn({
        organizationId: 'org-1',
        principal,
        producer: 'contentEngine',
      }),
    ).resolves.toEqual({ 'content-engine-production': 'unavailable' });
    expect(s.errors).toEqual([
      expect.stringContaining('producer install failed'),
    ]);
  });
});
