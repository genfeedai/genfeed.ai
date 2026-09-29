import { normalizeResponseModel } from '@api/services/agent-orchestrator/utils/agent-response-model.util';

describe('agent-response-model.util', () => {
  describe('normalizeResponseModel', () => {
    it('returns requested model when response is empty', () => {
      expect(normalizeResponseModel('openai/gpt-5.6-terra')).toBe(
        'openai/gpt-5.6-terra',
      );
    });
  });
});
