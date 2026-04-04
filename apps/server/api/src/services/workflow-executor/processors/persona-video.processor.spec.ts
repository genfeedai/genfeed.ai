import type { PersonaContentService } from '@api/services/persona-content/persona-content.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PersonaVideoProcessorInput } from './persona-video.processor';
import { PersonaVideoProcessor } from './persona-video.processor';

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function createMockPersonaContentService(
  overrides: Partial<PersonaContentService> = {},
): PersonaContentService {
  return {
    generateVideo: vi.fn().mockResolvedValue({
      generationId: 'gen-123',
      status: 'completed',
      url: 'https://example.com/video.mp4',
    }),
    ...overrides,
  } as unknown as PersonaContentService;
}

describe('PersonaVideoProcessor', () => {
  let processor: PersonaVideoProcessor;
  let personaContentService: PersonaContentService;
  let logger: LoggerService;

  const validInput: PersonaVideoProcessorInput = {
    aspectRatio: '16:9',
    organizationId: '507f1f77bcf86cd799439011',
    personaId: '507f1f77bcf86cd799439012',
    script: 'Hello world, this is a test script',
    userId: '507f1f77bcf86cd799439013',
  };

  beforeEach(() => {
    logger = createMockLogger();
    personaContentService = createMockPersonaContentService();
    processor = new PersonaVideoProcessor(personaContentService, logger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process - happy path', () => {
    it('should generate a video successfully', async () => {
      const result = await processor.process(validInput);

      expect(result.result).toEqual({
        generationId: 'gen-123',
        status: 'completed',
        url: 'https://example.com/video.mp4',
      });
      expect(result.promptUsed).toBe(validInput.script);
      expect(personaContentService.generateVideo).toHaveBeenCalledOnce();
    });

    it('should pass correct arguments to generateVideo', async () => {
      await processor.process(validInput);

      expect(personaContentService.generateVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          aspectRatio: '16:9',
          script: validInput.script,
        }),
      );
    });

    it('should log processing message', async () => {
      await processor.process(validInput);

      expect(logger.log).toHaveBeenCalledWith(
        'Processing PersonaVideoContent',
        {
          personaId: validInput.personaId,
        },
      );
    });
  });

  describe('process - with execution context', () => {
    it('should generate generationId when executionId and nodeId are provided', async () => {
      const inputWithExecution: PersonaVideoProcessorInput = {
        ...validInput,
        executionId: 'exec-123',
        nodeId: 'node-456',
      };

      const result = await processor.process(inputWithExecution);

      expect(result.generationId).toBeDefined();
      expect(result.generationId).toMatch(/^wf-exec-123-node-456-/);
      expect(result.workflowExecutionId).toBe('exec-123');
    });

    it('should not generate generationId without executionId', async () => {
      const result = await processor.process(validInput);

      expect(result.generationId).toBeUndefined();
      expect(result.workflowExecutionId).toBeUndefined();
    });

    it('should not generate generationId with only executionId (no nodeId)', async () => {
      const input: PersonaVideoProcessorInput = {
        ...validInput,
        executionId: 'exec-123',
      };

      const result = await processor.process(input);
      expect(result.generationId).toBeUndefined();
    });
  });

  describe('process - input validation', () => {
    it('should throw when personaId is missing', async () => {
      const input = { ...validInput, personaId: '' };
      await expect(processor.process(input)).rejects.toThrow(
        'Persona ID is required',
      );
    });

    it('should throw when script is missing', async () => {
      const input = { ...validInput, script: '' };
      await expect(processor.process(input)).rejects.toThrow(
        'Script is required',
      );
    });

    it('should throw when organizationId is missing', async () => {
      const input = { ...validInput, organizationId: '' };
      await expect(processor.process(input)).rejects.toThrow(
        'Organization ID is required',
      );
    });
  });

  describe('process - error handling', () => {
    it('should propagate errors from personaContentService', async () => {
      personaContentService.generateVideo = vi
        .fn()
        .mockRejectedValue(new Error('Video generation failed'));

      await expect(processor.process(validInput)).rejects.toThrow(
        'Video generation failed',
      );
    });

    it('should handle aspectRatio being undefined', async () => {
      const input: PersonaVideoProcessorInput = {
        ...validInput,
        aspectRatio: undefined,
      };

      const result = await processor.process(input);
      expect(result).toBeDefined();
      expect(personaContentService.generateVideo).toHaveBeenCalledWith(
        expect.objectContaining({ aspectRatio: undefined }),
      );
    });
  });
});
