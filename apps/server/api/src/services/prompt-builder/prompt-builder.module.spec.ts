import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { ConfigService } from '@api/config/config.service';
import { ReplicatePromptBuilder } from '@api/services/prompt-builder/builders/replicate-prompt.builder';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

describe('PromptBuilderModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        PromptBuilderService,
        ReplicatePromptBuilder,
        {
          provide: ConfigService,
          useValue: {
            get: (_key: string) => undefined,
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: TemplatesService,
          useValue: {
            getPromptByKey: vi.fn().mockResolvedValue(undefined),
            renderPrompt: vi.fn((template: string) => template),
          },
        },
      ],
    }).compile();
  });

  it('should be defined', () => {
    expect(PromptBuilderModule).toBeDefined();
    expect(module).toBeDefined();
  });

  it('should export PromptBuilderService', () => {
    const service = module.get<PromptBuilderService>(PromptBuilderService);
    expect(service).toBeDefined();
  });

  it('should have ReplicatePromptBuilder as provider', () => {
    const builder = module.get<ReplicatePromptBuilder>(ReplicatePromptBuilder);
    expect(builder).toBeDefined();
  });
});
