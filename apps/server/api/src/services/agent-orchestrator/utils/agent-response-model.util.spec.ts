import {
  buildResolvedModelMetadata,
  normalizeResponseModel,
} from '@api/services/agent-orchestrator/utils/agent-response-model.util';

describe('agent-response-model.util', () => {
  describe('buildResolvedModelMetadata', () => {
    it('uses the last actual model when present', () => {
      expect(
        buildResolvedModelMetadata('openai/gpt-5.6-terra', [
          'openai/gpt-5.6-luna',
          'openai/gpt-5.6-terra',
        ]),
      ).toEqual({
        actualModel: 'openai/gpt-5.6-terra',
        actualModels: ['openai/gpt-5.6-luna', 'openai/gpt-5.6-terra'],
        model: 'openai/gpt-5.6-terra',
        requestedModel: 'openai/gpt-5.6-terra',
      });
    });

    it('falls back to the requested model', () => {
      expect(buildResolvedModelMetadata('openai/gpt-5.6-terra')).toEqual({
        actualModel: 'openai/gpt-5.6-terra',
        actualModels: ['openai/gpt-5.6-terra'],
        model: 'openai/gpt-5.6-terra',
        requestedModel: 'openai/gpt-5.6-terra',
      });
    });
  });

  describe('normalizeResponseModel', () => {
    it('prefixes provider when response model is bare', () => {
      expect(
        normalizeResponseModel('openai/gpt-5.6-terra', 'gpt-5.6-luna'),
      ).toBe('openai/gpt-5.6-luna');
    });

    it('returns requested model when response is empty', () => {
      expect(normalizeResponseModel('openai/gpt-5.6-terra')).toBe(
        'openai/gpt-5.6-terra',
      );
    });
  });
});
