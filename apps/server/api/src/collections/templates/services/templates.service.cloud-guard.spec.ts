import {
  buildGuardedDelegate,
  type GuardedRow,
} from '@api/collections/models/testing/cloud-guarded-delegate';
import { TemplateMetadataService } from '@api/collections/template-metadata/services/template-metadata.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';

function promptRow(
  id: string,
  organizationId: string | null,
  key: string,
): GuardedRow {
  return {
    config: { content: `content of ${id}` },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    id,
    isActive: true,
    isDeleted: false,
    key,
    label: id,
    metadata: null,
    organizationId,
    purpose: 'prompt',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    variables: [],
  };
}

function setup() {
  const rows = [
    promptRow('platform-greeting', null, 'greeting'),
    promptRow('mine-greeting', ORG, 'greeting'),
    promptRow('platform-farewell', null, 'farewell'),
    promptRow('theirs-secret', OTHER_ORG, 'secret'),
  ];
  const prisma = {
    template: buildGuardedDelegate('Template', rows),
    templateMetadata: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;
  const metadata = new TemplateMetadataService(prisma);
  const logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn() };
  const service = new TemplatesService(
    prisma,
    {} as never,
    metadata,
    logger as never,
    {} as never,
    {} as never,
  );
  const inTenant = <T>(callback: () => Promise<T>) =>
    runWithTenantContext({ organizationId: ORG }, callback);

  return { inTenant, metadata, prisma, service };
}

describe('templates under the CLOUD tenant guard', () => {
  it('prefers the tenant override of a prompt key', async () => {
    const { inTenant, service } = setup();

    const prompt = await inTenant(() =>
      service.getPromptByKey('greeting', ORG),
    );

    expect(prompt?.id).toBe('mine-greeting');
  });

  it('falls back to the platform prompt when the tenant has no override', async () => {
    const { inTenant, service } = setup();

    const prompt = await inTenant(() =>
      service.getPromptByKey('farewell', ORG),
    );

    expect(prompt?.id).toBe('platform-farewell');
  });

  it('reads the platform prompt when the caller names no organization', async () => {
    const { inTenant, service } = setup();

    const prompt = await inTenant(() => service.getPromptByKey('greeting'));

    expect(prompt?.id).toBe('platform-greeting');
  });

  it('never resolves a prompt owned by another organization', async () => {
    const { inTenant, service } = setup();

    await expect(
      inTenant(() => service.getPromptByKey('secret', ORG)),
    ).resolves.toBeNull();
  });

  it('lists platform templates for a caller without an organization', async () => {
    const { inTenant, service } = setup();

    const templates = await inTenant(() => service.findAll());

    expect(templates.map((template) => template.id).sort()).toEqual([
      'platform-farewell',
      'platform-greeting',
    ]);
  });

  it('finds a prompt by key for the metadata updater as platform plus own', async () => {
    const { inTenant, metadata, prisma } = setup();

    await inTenant(() =>
      metadata.updateByTemplateKey('secret', { incrementUsage: true }),
    );
    expect(prisma.templateMetadata.updateMany).not.toHaveBeenCalled();

    await inTenant(() =>
      metadata.updateByTemplateKey('farewell', { incrementUsage: true }),
    );
    expect(prisma.templateMetadata.updateMany).toHaveBeenCalled();
  });
});
