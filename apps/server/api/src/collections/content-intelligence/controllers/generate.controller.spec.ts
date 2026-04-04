import { GenerateController } from '@api/collections/content-intelligence/controllers/generate.controller';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { RATE_LIMIT_KEY } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('GenerateController', () => {
  it('should be defined', () => {
    expect(GenerateController).toBeDefined();
  });

  it('should have rate limit on generate endpoint', () => {
    const metadata = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      GenerateController.prototype.generate,
    );
    expect(metadata).toEqual({
      limit: 30,
      scope: 'organization',
      windowMs: 60000,
    });
  });

  it('should have rate limit scope set to organization', () => {
    const metadata = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      GenerateController.prototype.generate,
    );
    expect(metadata.scope).toBe('organization');
  });

  describe('generate', () => {
    let controller: GenerateController;
    let contentGeneratorService: { generateContent: ReturnType<typeof vi.fn> };

    const mockUser = {
      id: 'user_123',
      publicMetadata: {
        organization: new Types.ObjectId().toString(),
        user: new Types.ObjectId().toString(),
      },
    } as unknown as User;

    beforeEach(async () => {
      contentGeneratorService = {
        generateContent: vi.fn().mockResolvedValue([
          {
            body: 'Generated body',
            content: 'Full content',
            cta: 'Click here',
            hashtags: ['#ai'],
            hook: 'Did you know?',
            patternId: 'p1',
            patternUsed: 'storytelling',
          },
        ]),
      };

      const module = await Test.createTestingModule({
        controllers: [GenerateController],
        providers: [
          {
            provide: ContentGeneratorService,
            useValue: contentGeneratorService,
          },
          {
            provide: LoggerService,
            useValue: { debug: vi.fn(), error: vi.fn(), log: vi.fn() },
          },
        ],
      }).compile();

      controller = module.get(GenerateController);
    });

    it('should return JSON:API formatted collection', async () => {
      const result = await controller.generate({} as Request, mockUser, {
        brandId: 'b1',
      } as never);

      expect(result.data).toBeInstanceOf(Array);
      expect(result.data[0].type).toBe('generated-content');
      expect(result.data[0].id).toBe('generated-0');
    });

    it('should include meta with pagination info', async () => {
      const result = await controller.generate({} as Request, mockUser, {
        brandId: 'b1',
      } as never);

      expect(result.meta.page).toBe(1);
      expect(result.meta.totalDocs).toBe(1);
    });

    it('should pass organizationId as ObjectId to service', async () => {
      await controller.generate({} as Request, mockUser, {
        brandId: 'b1',
      } as never);

      expect(contentGeneratorService.generateContent).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.any(Object),
      );
    });
  });
});
