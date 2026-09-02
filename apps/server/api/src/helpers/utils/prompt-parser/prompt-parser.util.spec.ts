import { PromptParser } from '@api/helpers/utils/prompt-parser/prompt-parser.util';
import { PromptCategory } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';

describe('PromptParser', () => {
  let configService: ConfigService;
  let configServiceGetMock: vi.Mock;

  beforeEach(() => {
    configServiceGetMock = vi.fn();
    configService = {
      get: configServiceGetMock,
    } as unknown as ConfigService;
  });

  describe('parsePrompt', () => {
    const mockAccount = {
      backgroundColor: '#0000FF',
      description: 'Test Description',
      label: 'Test Brand',
      primaryColor: '#FF0000',
      secondaryColor: '#00FF00',
      text: 'Test System Prompt',
    };

    it('should parse prompt with valid type and account', () => {
      const result = PromptParser.parsePrompt(configService, {
        brand: mockAccount,
        category: 'models-prompt-image',
        originalPrompt: 'Generate an image of a cat',
      });

      const expectedPromptObject = {
        brand: {
          backgroundColor: '#0000FF',
          description: 'Test Description',
          label: 'Test Brand',
          primaryColor: '#FF0000',
          secondaryColor: '#00FF00',
          systemPrompt: 'Test System Prompt',
        },
        prompt: 'Generate an image of a cat',
      };

      expect(result.normalizedType).toBe(PromptCategory.MODELS_PROMPT_IMAGE);
      expect(result.promptObject).toEqual(expectedPromptObject);
      expect(result.promptString).toBe(JSON.stringify(result.promptObject));
    });

    it('should throw error for unsupported prompt type', () => {
      expect(() =>
        PromptParser.parsePrompt(configService, {
          brand: mockAccount,
          category: 'invalid-type',
          originalPrompt: 'Test prompt',
        }),
      ).toThrow('Invalid prompt category: invalid-type');
    });

    it('should parse prompt without account', () => {
      const result = PromptParser.parsePrompt(configService, {
        brand: null,
        category: 'models-prompt-image',
        originalPrompt: 'Test prompt',
      });

      expect(result.promptObject).toEqual({
        prompt: 'Test prompt',
      });
    });

    it('should handle account with missing optional fields', () => {
      const minimalAccount = {
        label: 'Test Brand',
      };

      const result = PromptParser.parsePrompt(configService, {
        brand: minimalAccount,
        category: 'models-prompt-image',
        originalPrompt: 'Test prompt',
      });

      expect(result.promptObject.brand).toEqual({
        backgroundColor: undefined,
        description: '',
        label: 'Test Brand',
        primaryColor: undefined,
        secondaryColor: undefined,
        systemPrompt: '',
      });
    });
  });

  describe('getSupportedTypes', () => {
    it('should return all supported prompt types from enum', () => {
      const supportedTypes = PromptParser.getSupportedTypes();

      expect(supportedTypes).toContain(PromptCategory.MODELS_PROMPT_IMAGE);
      expect(supportedTypes).toContain(PromptCategory.BRAND_DESCRIPTION);
      expect(supportedTypes).toContain(
        PromptCategory.STORYBOARD_SCRIPT_DESCRIPTION,
      );
      expect(supportedTypes.length).toBeGreaterThan(0);
    });
  });
});
