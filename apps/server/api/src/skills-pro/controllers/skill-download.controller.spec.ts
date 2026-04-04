import { SkillDownloadController } from '@api/skills-pro/controllers/skill-download.controller';
import { SkillDownloadService } from '@api/skills-pro/services/skill-download.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('SkillDownloadController', () => {
  let controller: SkillDownloadController;
  let skillDownloadService: {
    verifyReceipt: ReturnType<typeof vi.fn>;
    getDownloadUrl: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    skillDownloadService = {
      getDownloadUrl: vi.fn(),
      verifyReceipt: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkillDownloadController],
      providers: [
        {
          provide: SkillDownloadService,
          useValue: skillDownloadService,
        },
      ],
    }).compile();

    controller = module.get<SkillDownloadController>(SkillDownloadController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('verifyReceipt', () => {
    it('should call skillDownloadService.verifyReceipt with receiptId', async () => {
      const expected = {
        email: 'user@example.com',
        productType: 'bundle',
        skills: ['image-gen-pro', 'video-editor'],
        valid: true,
      };
      skillDownloadService.verifyReceipt.mockResolvedValue(expected);

      const result = await controller.verifyReceipt({
        receiptId: 'sk_rcpt_abc123',
      });

      expect(skillDownloadService.verifyReceipt).toHaveBeenCalledWith(
        'sk_rcpt_abc123',
      );
      expect(result).toEqual(expected);
    });

    it('should return invalid result when receipt is not found', async () => {
      skillDownloadService.verifyReceipt.mockResolvedValue({
        email: '',
        productType: '',
        skills: [],
        valid: false,
      });

      const result = await controller.verifyReceipt({
        receiptId: 'nonexistent',
      });

      expect(result.valid).toBe(false);
      expect(result.skills).toHaveLength(0);
    });

    it('should propagate service errors', async () => {
      skillDownloadService.verifyReceipt.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(
        controller.verifyReceipt({ receiptId: 'sk_rcpt_err' }),
      ).rejects.toThrow('DB error');
    });

    it('should return empty skills when receipt has no associated skills', async () => {
      skillDownloadService.verifyReceipt.mockResolvedValue({
        email: 'a@b.com',
        productType: 'bundle',
        skills: [],
        valid: true,
      });

      const result = await controller.verifyReceipt({
        receiptId: 'sk_rcpt_empty',
      });

      expect(result.valid).toBe(true);
      expect(result.skills).toEqual([]);
    });
  });

  describe('downloadSkill', () => {
    it('should call getDownloadUrl with receiptId and skillSlug', async () => {
      const expected = {
        downloadUrl:
          'https://cdn.example.com/skills/image-gen-pro.zip?token=xyz',
        expiresIn: 900,
        skill: {
          name: 'Image Gen Pro',
          slug: 'image-gen-pro',
          version: '1.0.0',
        },
      };
      skillDownloadService.getDownloadUrl.mockResolvedValue(expected);

      const result = await controller.downloadSkill({
        receiptId: 'sk_rcpt_abc123',
        skillSlug: 'image-gen-pro',
      });

      expect(skillDownloadService.getDownloadUrl).toHaveBeenCalledWith(
        'sk_rcpt_abc123',
        'image-gen-pro',
      );
      expect(result).toEqual(expected);
    });

    it('should work without skillSlug (undefined)', async () => {
      skillDownloadService.getDownloadUrl.mockRejectedValue(
        new BadRequestException('skillSlug is required'),
      );

      await expect(
        controller.downloadSkill({ receiptId: 'sk_rcpt_abc123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should propagate NotFoundException when receipt is invalid', async () => {
      skillDownloadService.getDownloadUrl.mockRejectedValue(
        new NotFoundException('Receipt not found'),
      );

      await expect(
        controller.downloadSkill({
          receiptId: 'bad-receipt',
          skillSlug: 'image-gen-pro',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return correct download URL for a valid slug', async () => {
      const downloadUrl =
        'https://s3.amazonaws.com/skills/video-editor-v2.zip?sig=abc';
      skillDownloadService.getDownloadUrl.mockResolvedValue({
        downloadUrl,
        expiresIn: 900,
        skill: { name: 'Video Editor', slug: 'video-editor', version: '2.0.0' },
      });

      const result = await controller.downloadSkill({
        receiptId: 'sk_rcpt_xyz',
        skillSlug: 'video-editor',
      });

      expect(result.downloadUrl).toBe(downloadUrl);
      expect(result.skill.slug).toBe('video-editor');
    });

    it('should propagate service errors on download', async () => {
      skillDownloadService.getDownloadUrl.mockRejectedValue(
        new Error('S3 error'),
      );

      await expect(
        controller.downloadSkill({
          receiptId: 'sk_rcpt_abc',
          skillSlug: 'some-skill',
        }),
      ).rejects.toThrow('S3 error');
    });
  });
});
