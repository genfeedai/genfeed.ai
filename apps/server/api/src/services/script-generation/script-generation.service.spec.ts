import { ScriptGenerationService } from '@api/services/script-generation/script-generation.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const request = {
  brandId: 'brand-1',
  durationSeconds: 30,
  organizationId: 'org-1',
  platform: 'tiktok',
  topic: 'Launch day',
  userId: 'user-1',
};

function createService(brief: { text: string } | null = { text: 'BRIEF' }) {
  const harness = {
    formatBrief: vi.fn((value: { text: string } | null) => value?.text ?? ''),
    resolveBrief: vi.fn().mockResolvedValue(brief),
  };
  const llm = {
    chatCompletion: vi.fn().mockResolvedValue({
      choices: [{ message: { content: ' Hook line.\nBeat one. ' } }],
    }),
  };
  const logger = { warn: vi.fn() };
  const service = new ScriptGenerationService(
    harness as never,
    llm as never,
    logger as never,
  );
  return { harness, llm, service };
}

describe('ScriptGenerationService', () => {
  it('writes the script against the composed script brief', async () => {
    const { harness, llm, service } = createService();

    await expect(service.generate(request)).resolves.toBe(
      'Hook line.\nBeat one.',
    );

    expect(harness.resolveBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        contentType: 'script',
        organizationId: 'org-1',
        topic: 'Launch day',
      }),
    );
    const [params, organizationId] = llm.chatCompletion.mock.calls[0];
    expect(organizationId).toBe('org-1');
    expect(params.messages[0].content).toContain('BRIEF');
    expect(params.messages[1].content).toContain('Launch day');
    expect(params.messages[1].content).toContain('about 30 seconds');
  });

  it.each([null, { text: '   ' }])(
    'fails instead of writing a generic script when the brief is %j',
    async (brief) => {
      const { llm, service } = createService(brief);

      await expect(service.generate(request)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(llm.chatCompletion).not.toHaveBeenCalled();
    },
  );
});
