import { ModelsService } from '@api/collections/models/services/models.service';
import { TemplateMetadataService } from '@api/collections/template-metadata/services/template-metadata.service';
import { TemplateUsageService } from '@api/collections/template-usage/services/template-usage.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type Template } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('TemplatesService', () => {
  let service: TemplatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        {
          provide: PrismaService,
          useValue: {
            find: vi.fn().mockReturnThis(),
            findOne: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: TemplateUsageService,
          useValue: { create: vi.fn() },
        },
        {
          provide: TemplateMetadataService,
          useValue: { update: vi.fn(), updateByTemplateKey: vi.fn() },
        },
        {
          provide: ReplicateService,
          useValue: { run: vi.fn() },
        },
        {
          provide: ModelsService,
          useValue: {
            getOneByKey: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: LoggerService,
          useValue: { debug: vi.fn(), error: vi.fn(), log: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<TemplatesService>(TemplatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.create).toBeDefined();
    expect(service.update).toBeDefined();
    expect(service.remove).toBeDefined();
  });

  it('should have useTemplate method', () => {
    expect(service.useTemplate).toBeDefined();
  });

  it('should have suggestTemplates method', () => {
    expect(service.suggestTemplates).toBeDefined();
  });
});
