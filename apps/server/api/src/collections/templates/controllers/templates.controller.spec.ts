vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { TemplatesController } from '@api/collections/templates/controllers/templates.controller';
import { CreateTemplateDto } from '@api/collections/templates/dto/create-template.dto';
import { SuggestTemplatesDto } from '@api/collections/templates/dto/suggest-templates.dto';
import { UpdateTemplateDto } from '@api/collections/templates/dto/update-template.dto';
import { UseTemplateDto } from '@api/collections/templates/dto/use-template.dto';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import type { User } from '@clerk/backend';
import { AssetScope } from '@genfeedai/enums';
import { Test, TestingModule } from '@nestjs/testing';

describe('TemplatesController', () => {
  let controller: TemplatesController;
  let service: TemplatesService;

  const mockUser: User = {
    id: 'user_123',
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockTemplate = {
    _id: '507f1f77bcf86cd799439014',
    categories: ['marketing'],
    category: 'email',
    createdAt: new Date(),
    description: 'Professional email template',
    label: 'Marketing Email Template',
    organization: '507f1f77bcf86cd799439012',
    platforms: ['email'],
    scope: AssetScope.PUBLIC,
    updatedAt: new Date(),
  };

  const mockTemplatesService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    getPopularTemplates: vi.fn(),
    remove: vi.fn(),
    suggestTemplates: vi.fn(),
    update: vi.fn(),
    useTemplate: vi.fn(),
  };

  const mockReq = {} as import('express').Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatesController],
      providers: [
        {
          provide: CreditsUtilsService,
          useValue: {
            checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
            getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
          },
        },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: TemplatesService,
          useValue: mockTemplatesService,
        },
      ],
    })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TemplatesController>(TemplatesController);
    service = module.get<TemplatesService>(TemplatesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a template', async () => {
      const dto: CreateTemplateDto = {
        category: 'email',
        description: 'Professional email template',
        label: 'Marketing Email Template',
        purpose: 'content',
      };

      mockTemplatesService.create.mockResolvedValue(mockTemplate);

      const result = await controller.create(mockReq, dto, mockUser);

      expect(service.create).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
        mockUser.id,
      );
      expect(result).toEqual(mockTemplate);
    });
  });

  describe('findAll', () => {
    it('should return all templates', async () => {
      const templates = [mockTemplate];
      mockTemplatesService.findAll.mockResolvedValue(templates);

      const result = await controller.findAll(mockReq, mockUser, {});

      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual(templates);
    });
  });

  describe('findOne', () => {
    it('should return a template by id', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockTemplatesService.findOne.mockResolvedValue(mockTemplate);

      const result = await controller.findOne(mockReq, id, mockUser);

      expect(service.findOne).toHaveBeenCalledWith(
        id,
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual(mockTemplate);
    });
  });

  describe('update', () => {
    it('should update a template', async () => {
      const id = '507f1f77bcf86cd799439014';
      const dto: UpdateTemplateDto = {
        label: 'Updated Template',
      };

      const updatedTemplate = { ...mockTemplate, ...dto };
      mockTemplatesService.update.mockResolvedValue(updatedTemplate);

      const result = await controller.update(mockReq, id, dto, mockUser);

      expect(service.update).toHaveBeenCalledWith(
        id,
        dto,
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual(updatedTemplate);
    });
  });

  describe('remove', () => {
    it('should delete a template', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockTemplatesService.remove.mockResolvedValue(undefined);

      const result = await controller.remove(id, mockUser);

      expect(service.remove).toHaveBeenCalledWith(
        id,
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual({ message: 'Template deleted successfully' });
    });
  });

  describe('useTemplate', () => {
    it('should use template with variables', async () => {
      const dto: UseTemplateDto = {
        templateId: '507f1f77bcf86cd799439014',
        variables: { name: 'John', product: 'SaaS' },
      };

      const filled = {
        content: 'Hi John, check out our SaaS product!',
        templateId: dto.templateId,
      };

      mockTemplatesService.useTemplate.mockResolvedValue(filled);

      const result = await controller.useTemplate(mockReq, dto, mockUser);

      expect(service.useTemplate).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
        mockUser.id,
        expect.any(Function),
      );
      expect(result).toEqual(filled);
    });
  });

  describe('suggestTemplates', () => {
    it('should suggest relevant templates', async () => {
      const dto: SuggestTemplatesDto = {
        goal: 'increase engagement',
        industry: 'tech',
        platform: 'instagram',
      };

      const suggestions = [mockTemplate];
      mockTemplatesService.suggestTemplates.mockResolvedValue(suggestions);

      const result = await controller.suggestTemplates(mockReq, dto, mockUser);

      expect(service.suggestTemplates).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
        expect.any(Function),
      );
      expect(result).toEqual(suggestions);
    });
  });

  describe('getPopularTemplates', () => {
    it('should return popular templates', async () => {
      const popular = [mockTemplate];
      mockTemplatesService.getPopularTemplates.mockResolvedValue(popular);

      const result = await controller.getPopularTemplates(mockReq, mockUser);

      expect(service.getPopularTemplates).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        10,
      );
      expect(result).toEqual(popular);
    });

    it('should accept custom limit', async () => {
      mockTemplatesService.getPopularTemplates.mockResolvedValue([]);

      await controller.getPopularTemplates(mockReq, mockUser, '20');

      expect(service.getPopularTemplates).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        20,
      );
    });
  });
});
