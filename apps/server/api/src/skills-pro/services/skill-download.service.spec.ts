import { SkillDownloadService } from '@api/skills-pro/services/skill-download.service';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { SkillsService } from '@server/collections/skills/services/skills.service';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

function createStoredZip(entries: Array<{ name: string; content: string }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = Buffer.from(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

describe('SkillDownloadService', () => {
  let service: SkillDownloadService;
  const findFirst = vi.fn();
  const updateMany = vi.fn();
  const getRegistry = vi.fn();
  const getSkillBySlug = vi.fn();
  const getPresignedDownloadUrl = vi.fn();
  const installManagedSkillPackage = vi.fn();
  const originalFetch = globalThis.fetch;

  const skill = {
    category: 'generation',
    checksum: `sha256:${'a'.repeat(64)}`,
    description: 'Generate images',
    name: 'Image Gen Pro',
    s3Key: 'skills/image-gen-pro.zip',
    slug: 'image-gen-pro',
    version: '1.0.0',
  };

  function receipt(overrides: Record<string, unknown> = {}) {
    return {
      data: { email: 'buyer@example.com' },
      expiresAt: null,
      id: 'db-receipt-1',
      organizationId: 'org-1',
      productType: 'skill',
      skillSlugs: ['image-gen-pro'],
      status: 'completed',
      ...overrides,
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    globalThis.fetch = originalFetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillDownloadService,
        { provide: ConfigService, useValue: {} },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
        {
          provide: SkillRegistryService,
          useValue: { getRegistry, getSkillBySlug },
        },
        {
          provide: FilesClientService,
          useValue: { getPresignedDownloadUrl },
        },
        {
          provide: PrismaService,
          useValue: { skillReceipt: { findFirst, updateMany } },
        },
        {
          provide: SkillsService,
          useValue: { installManagedSkillPackage },
        },
      ],
    }).compile();

    service = module.get(SkillDownloadService);
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns only the typed slugs granted to this organization', async () => {
    findFirst.mockResolvedValueOnce(receipt()).mockResolvedValueOnce(receipt());

    await expect(
      service.verifyReceipt('org-1', 'sk_rcpt_one'),
    ).resolves.toEqual({
      email: 'buyer@example.com',
      productType: 'skill',
      skills: ['image-gen-pro'],
      valid: true,
    });
    expect(getRegistry).not.toHaveBeenCalled();
  });

  it('fails closed when the receipt belongs to another organization', async () => {
    findFirst.mockResolvedValueOnce(receipt({ organizationId: 'org-2' }));

    await expect(
      service.verifyReceipt('org-1', 'sk_rcpt_one'),
    ).resolves.toEqual({
      email: '',
      productType: '',
      skills: [],
      valid: false,
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('atomically claims a legacy unowned receipt', async () => {
    findFirst
      .mockResolvedValueOnce(receipt({ organizationId: null }))
      .mockResolvedValueOnce(receipt());
    updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      service.verifyReceipt('org-1', 'sk_rcpt_one'),
    ).resolves.toMatchObject({
      valid: true,
    });
    expect(updateMany).toHaveBeenCalledWith({
      data: { organizationId: 'org-1' },
      where: expect.objectContaining({
        id: 'db-receipt-1',
        organizationId: null,
      }),
    });
  });

  it('resolves legacy bundle grants to the current registry', async () => {
    const bundle = receipt({ productType: 'bundle', skillSlugs: [] });
    findFirst.mockResolvedValueOnce(bundle).mockResolvedValueOnce(bundle);
    getRegistry.mockResolvedValue({ skills: [skill, { slug: 'video-pro' }] });

    await expect(
      service.verifyReceipt('org-1', 'sk_rcpt_one'),
    ).resolves.toMatchObject({
      productType: 'bundle',
      skills: ['image-gen-pro', 'video-pro'],
      valid: true,
    });
  });

  it('rejects download of a skill outside the receipt grant', async () => {
    const unrelated = receipt({ skillSlugs: ['video-pro'] });
    findFirst.mockResolvedValueOnce(unrelated).mockResolvedValueOnce(unrelated);

    await expect(
      service.getDownloadUrl('org-1', 'sk_rcpt_one', 'image-gen-pro'),
    ).rejects.toThrow(ForbiddenException);
    expect(getPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('generates a URL and records a scoped download', async () => {
    findFirst.mockResolvedValueOnce(receipt()).mockResolvedValueOnce(receipt());
    getRegistry.mockResolvedValue({ skills: [skill] });
    getSkillBySlug.mockReturnValue(skill);
    getPresignedDownloadUrl.mockResolvedValue('https://cdn.example/download');
    updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      service.getDownloadUrl('org-1', 'sk_rcpt_one', 'image-gen-pro'),
    ).resolves.toMatchObject({ downloadUrl: 'https://cdn.example/download' });
    expect(updateMany).toHaveBeenCalledWith({
      data: {
        downloadCount: { increment: 1 },
        lastDownloadedAt: expect.any(Date),
      },
      where: {
        id: 'db-receipt-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('refuses to install a pack whose SHA-256 does not match the registry', async () => {
    findFirst.mockResolvedValueOnce(receipt()).mockResolvedValueOnce(receipt());
    getRegistry.mockResolvedValue({ skills: [skill] });
    getSkillBySlug.mockReturnValue(skill);
    getPresignedDownloadUrl.mockResolvedValue('https://cdn.example/download');
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      );

    await expect(
      service.installSkill('org-1', 'sk_rcpt_one', 'image-gen-pro'),
    ).rejects.toThrow('integrity check failed');
    expect(installManagedSkillPackage).not.toHaveBeenCalled();
  });

  it('installs a verified pack into the tenant runtime store', async () => {
    const archive = createStoredZip([
      {
        content: JSON.stringify({
          description: 'Private pack fixture',
          name: 'image-gen-pro',
          tags: ['image'],
          version: '1.0.0',
        }),
        name: 'metadata.json',
      },
      { content: '# Private fixture instructions', name: 'SKILL.md' },
    ]);
    const checksum = createHash('sha256').update(archive).digest('hex');
    const verifiedSkill = { ...skill, checksum: `sha256:${checksum}` };
    findFirst.mockResolvedValueOnce(receipt()).mockResolvedValueOnce(receipt());
    getRegistry.mockResolvedValue({ skills: [verifiedSkill] });
    getSkillBySlug.mockReturnValue(verifiedSkill);
    getPresignedDownloadUrl.mockResolvedValue('https://cdn.example/download');
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array(archive), { status: 200 }),
      );
    installManagedSkillPackage.mockResolvedValue({
      id: 'skill-1',
      name: 'Image Gen Pro',
      slug: 'image-gen-pro',
      version: '1.0.0',
    });
    updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      service.installSkill('org-1', 'sk_rcpt_one', 'image-gen-pro'),
    ).resolves.toEqual({
      id: 'skill-1',
      name: 'Image Gen Pro',
      slug: 'image-gen-pro',
      status: 'installed',
      version: '1.0.0',
    });
    expect(installManagedSkillPackage).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        checksum,
        files: expect.arrayContaining([
          expect.objectContaining({ path: 'SKILL.md' }),
        ]),
        instructions: '# Private fixture instructions',
        slug: 'image-gen-pro',
      }),
    );
  });
});

import { createHash } from 'node:crypto';
