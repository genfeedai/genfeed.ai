import { type AIRequest, requestAI } from '@providers/ai/ai.provider';
import { describe, expect, it } from 'vitest';

describe('ai.provider', () => {
  describe('requestAI', () => {
    it('should throw because AI provider is not yet migrated to NestJS backend', async () => {
      const request: AIRequest = {
        action: 'summarize',
        text: 'Hello world',
      };

      await expect(requestAI(request)).rejects.toThrow(
        'AI provider is not yet migrated to the NestJS backend',
      );
    });
  });
});
