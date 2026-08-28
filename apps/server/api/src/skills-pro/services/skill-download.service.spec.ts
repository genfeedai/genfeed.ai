import { SkillDownloadService } from '@api/skills-pro/services/skill-download.service';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

describe('SkillDownloadService', () => {
  let service: SkillDownloadService;

  const findFirst = vi.fn();
  const update = vi.fn();
  const getRegistry = vi.fn();
  const getSkillBySlug = vi.fn();
  const getPresignedDownloadUrl = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

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
          useValue: { skillReceipt: { findFirst, update } },
        },
      ],
    }).compile();

    service = module.get(SkillDownloadService);
  });

  it('verifies a completed receipt with a targeted JSON query', async () => {
    findFirst.mockResolvedValue({
      data: {
        email: 'buyer@example.com',
        receiptId: 'receipt-1',
        status: 'completed',
      },
      id: 'db-receipt-1',
    });
    getRegistry.mockResolvedValue({
      skills: [{ slug: 'image-gen-pro' }, { slug: 'video-editor' }],
    });

    await expect(service.verifyReceipt('receipt-1')).resolves.toEqual({
      email: 'buyer@example.com',
      productType: 'bundle',
      skills: ['image-gen-pro', 'video-editor'],
      valid: true,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        AND: [
          { data: { equals: 'receipt-1', path: ['receiptId'] } },
          { data: { equals: 'completed', path: ['status'] } },
        ],
        isDeleted: false,
      },
    });
  });

  it('returns invalid without loading the registry when no receipt matches', async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.verifyReceipt('missing')).resolves.toEqual({
      email: '',
      productType: '',
      skills: [],
      valid: false,
    });
    expect(getRegistry).not.toHaveBeenCalled();
  });

  it('uses the targeted receipt when generating a download URL', async () => {
    findFirst.mockResolvedValue({
      data: { downloadCount: 2, receiptId: 'receipt-1', status: 'completed' },
      id: 'db-receipt-1',
    });
    const skill = {
      checksum: 'sha256:abc',
      name: 'Image Gen Pro',
      s3Key: 'skills/image-gen-pro.zip',
      slug: 'image-gen-pro',
      version: '1.0.0',
    };
    getRegistry.mockResolvedValue({ skills: [skill] });
    getSkillBySlug.mockReturnValue(skill);
    getPresignedDownloadUrl.mockResolvedValue('https://cdn.example/download');
    update.mockResolvedValue({});

    const result = await service.getDownloadUrl('receipt-1', 'image-gen-pro');

    expect(result.downloadUrl).toBe('https://cdn.example/download');
    expect(getPresignedDownloadUrl).toHaveBeenCalledWith(
      'skills/image-gen-pro.zip',
      'skills',
      900,
    );
    expect(update).toHaveBeenCalledWith({
      data: {
        data: expect.objectContaining({ downloadCount: 3 }),
      },
      where: { id: 'db-receipt-1' },
    });
  });
});
