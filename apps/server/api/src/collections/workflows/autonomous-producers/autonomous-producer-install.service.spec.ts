import {
  AUTONOMOUS_PRODUCER_TEMPLATES,
  AutonomousProducerInstallService,
} from '@api/collections/workflows/autonomous-producers/autonomous-producer-install.service';
import { SYSTEM_WORKFLOW_CATALOG } from '@api/collections/workflows/workflows.tokens';
import { describe, expect, it, vi } from 'vitest';

const principal = { organizationId: 'org-1', userId: 'user-1' };

function setup(options: { hasCatalog?: boolean } = {}) {
  const prisma = { workflow: { findFirst: vi.fn().mockResolvedValue(null) } };
  const catalog = { install: vi.fn().mockResolvedValue({ id: 'workflow-1' }) };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const moduleRef = {
    get: vi.fn((token: symbol) => {
      if (token === SYSTEM_WORKFLOW_CATALOG && options.hasCatalog !== false)
        return catalog;
      throw new Error('not found');
    }),
  };
  const service = new AutonomousProducerInstallService(
    prisma as never,
    logger as never,
    moduleRef as never,
  );
  return { catalog, logger, prisma, service };
}

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
    for (const canonicalId of AUTONOMOUS_PRODUCER_TEMPLATES.campaigns)
      expect(s.catalog.install).toHaveBeenCalledWith({
        canonicalId,
        organizationId: 'org-1',
        schedulePrincipal: principal,
        userId: 'user-1',
      });
  });

  it('keeps an existing row, including a paused or deleted one, untouched', async () => {
    const s = setup();
    s.prisma.workflow.findFirst.mockResolvedValue({ id: 'paused-clone' });

    const outcomes = await s.service.installOnOptIn({
      organizationId: 'org-1',
      principal,
      producer: 'contentEngine',
    });

    expect(outcomes).toEqual({ 'content-engine-production': 'kept' });
    expect(s.catalog.install).not.toHaveBeenCalled();
    // The lookup has no isDeleted or status filter: soft-deleted and paused
    // installs are tenant controls, never re-created or re-enabled.
    expect(s.prisma.workflow.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        metadata: {
          equals: 'content-engine-production',
          path: ['sourceTemplateId'],
        },
        organizationId: 'org-1',
      },
    });
  });

  it('never fails the opt-in when the install cannot happen', async () => {
    const missing = setup({ hasCatalog: false });
    await expect(
      missing.service.installOnOptIn({
        organizationId: 'org-1',
        principal,
        producer: 'contentEngine',
      }),
    ).resolves.toEqual({ 'content-engine-production': 'unavailable' });

    const failing = setup();
    failing.catalog.install.mockRejectedValue(new Error('scheduler down'));
    await expect(
      failing.service.installOnOptIn({
        organizationId: 'org-1',
        principal,
        producer: 'contentEngine',
      }),
    ).resolves.toEqual({ 'content-engine-production': 'unavailable' });
    expect(failing.logger.error).toHaveBeenCalled();
  });
});
