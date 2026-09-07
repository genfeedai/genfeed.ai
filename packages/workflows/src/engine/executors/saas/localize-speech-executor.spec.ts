import { describe, expect, it, vi } from 'vitest';
import type { ExecutorInput } from '../base-executor';
import { LocalizeSpeechExecutor } from './localize-speech-executor';

function input(): ExecutorInput {
  return {
    context: {
      organizationId: 'org',
      runId: 'run',
      userId: 'user',
      workflowId: 'wf',
    },
    inputs: new Map<string, unknown>([
      ['video', { id: 'source', videoUrl: 'https://cdn.example.com/ad.mp4' }],
      ['script', 'An approved Spanish script'],
    ]),
    node: {
      id: 'localize',
      label: 'Localize Speech',
      type: 'localizeSpeech',
      inputs: [],
      config: { brandId: 'brand', targetLanguage: 'es', voiceId: 'voice' },
    },
  };
}
describe('LocalizeSpeechExecutor', () => {
  it('passes the source artifact, selected language and edited script without regenerating video', async () => {
    const executor = new LocalizeSpeechExecutor();
    const result = {
      audio: {
        id: 'a',
        audioUrl: 'https://cdn.example.com/es.mp3',
        duration: 30,
        status: 'completed',
      },
      transcript: {
        text: 'Original',
        segments: [{ start: 0, end: 3, text: 'Original' }],
      },
      translatedScript: 'Spanish',
      segments: [{ start: 0, end: 3, text: 'Spanish' }],
      duration: 30,
    };
    const resolver = vi.fn().mockResolvedValue(result);
    executor.setResolver(resolver);
    const request = input();
    expect((await executor.execute(request)).data).toEqual(result);
    expect(resolver).toHaveBeenCalledWith(
      { id: 'source', videoUrl: 'https://cdn.example.com/ad.mp4' },
      {
        brandId: 'brand',
        targetLanguage: 'es',
        voiceId: 'voice',
        script: 'An approved Spanish script',
        sourceLanguage: undefined,
        segments: undefined,
        timingToleranceSeconds: 0.75,
      },
      request.context,
      {
        ...request.node,
        config: {
          ...request.node.config,
          script: 'An approved Spanish script',
        },
      },
    );
  });
  it('rejects missing language and nonfinite tolerance before a provider call', async () => {
    const executor = new LocalizeSpeechExecutor();
    const resolver = vi.fn();
    executor.setResolver(resolver);
    const request = input();
    request.node.config.targetLanguage = '';
    request.node.config.timingToleranceSeconds = Number.NaN;
    await expect(executor.execute(request)).rejects.toThrow(
      'targetLanguage is required',
    );
    expect(resolver).not.toHaveBeenCalled();
  });
  it('resolves connected localization settings before validation and overrides saved defaults', async () => {
    const executor = new LocalizeSpeechExecutor();
    const resolver = vi.fn().mockResolvedValue({ duration: 30 });
    executor.setResolver(resolver);
    const request = input();
    request.node.config = {};
    request.inputs.set('brandId', 'connected-brand');
    request.inputs.set('voiceId', 'connected-voice');
    request.inputs.set('targetLanguage', 'es');
    request.inputs.set('sourceLanguage', 'en');
    request.inputs.set('timingToleranceSeconds', 0.25);
    await executor.execute(request);
    expect(resolver).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        brandId: 'connected-brand',
        voiceId: 'connected-voice',
        targetLanguage: 'es',
        sourceLanguage: 'en',
        timingToleranceSeconds: 0.25,
      }),
      request.context,
      expect.objectContaining({
        config: expect.objectContaining({ targetLanguage: 'es' }),
      }),
    );
    expect(request.node.config).toEqual({});
  });
});
