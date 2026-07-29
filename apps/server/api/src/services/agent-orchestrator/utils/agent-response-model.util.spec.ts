import {
  buildResolvedModelMetadata,
  normalizeResponseModel,
} from '@api/services/agent-orchestrator/utils/agent-response-model.util';

describe('agent-response-model.util', () => {
  describe('buildResolvedModelMetadata', () => {
    it('uses the last actual model when present', () => {
      expect(
        buildResolvedModelMetadata('openai/gpt-4o', [
          'openai/gpt-4o-mini',
          'openai/gpt-4o',
        ]),
      ).toEqual({
        actualModel: 'openai/gpt-4o',
        actualModels: ['openai/gpt-4o-mini', 'openai/gpt-4o'],
        model: 'openai/gpt-4o',
        requestedModel: 'openai/gpt-4o',
      });
    });

    it('falls back to the requested model', () => {
      expect(buildResolvedModelMetadata('openai/gpt-4o')).toEqual({
        actualModel: 'openai/gpt-4o',
        actualModels: ['openai/gpt-4o'],
        model: 'openai/gpt-4o',
        requestedModel: 'openai/gpt-4o',
      });
    });
  });

  describe('normalizeResponseModel', () => {
    it('prefixes provider when response model is bare', () => {
      expect(normalizeResponseModel('openai/gpt-4o', 'gpt-4o-mini')).toBe(
        'openai/gpt-4o-mini',
      );
    });

    it('returns requested model when response is empty', () => {
      expect(normalizeResponseModel('openai/gpt-4o')).toBe('openai/gpt-4o');
    });
  });
});
