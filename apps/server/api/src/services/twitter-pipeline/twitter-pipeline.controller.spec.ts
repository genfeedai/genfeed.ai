import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TwitterPublishType } from '@api/services/twitter-pipeline/dto/twitter-pipeline.dto';
import { TwitterPipelineController } from '@api/services/twitter-pipeline/twitter-pipeline.controller';
import { TwitterPipelineService } from '@api/services/twitter-pipeline/twitter-pipeline.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('TwitterPipelineController', () => {
  let controller: TwitterPipelineController;
  let service: vi.Mocked<TwitterPipelineService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TwitterPipelineController],
      providers: [
        {
          provide: TwitterPipelineService,
          useValue: {
            draft: vi.fn(),
            publish: vi.fn(),
            search: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TwitterPipelineController>(
      TwitterPipelineController,
    );
    service = module.get(TwitterPipelineService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('search', () => {
    it('should call service.search with params', async () => {
      service.search.mockResolvedValue([]);
      await controller.search('org-1', {
        brandId: 'brand-1',
        query: 'test',
      });
      expect(service.search).toHaveBeenCalledWith('org-1', 'brand-1', 'test', {
        maxResults: undefined,
      });
    });
  });

  describe('draft', () => {
    it('should call service.draft', async () => {
      service.draft.mockResolvedValue([]);
      await controller.draft('org-1', {
        searchResults: [],
        voiceConfig: {
          description: 'Test voice',
          handle: 'test',
          searchQuery: 'test',
        },
      });
      expect(service.draft).toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('should call service.publish', async () => {
      service.publish.mockResolvedValue({ success: true });
      await controller.publish('org-1', {
        brandId: 'b',
        text: 'hi',
        type: TwitterPublishType.REPLY,
      });
      expect(service.publish).toHaveBeenCalled();
    });
  });
});
