import {
  getCompatibleNodes,
  getNodeDefinition,
  NODE_REGISTRY,
  SOURCE_CORPUS_CONFIG_LIMITS,
  validateConnection,
} from '@api/collections/workflows/registry/node-registry';
import { describe, expect, it } from 'vitest';

describe('workflow presentation node registry', () => {
  it('preserves the ordered public node definition catalog', () => {
    expect(Object.keys(NODE_REGISTRY)).toEqual([
      'ai-avatar-video',
      'talkingHeadScript',
      'ai-enhance',
      'ai-generate-image',
      'ai-generate-newsletter',
      'ai-generate-post',
      'source-corpus',
      'attach-post-ingredient',
      'analytics-feedback',
      'ai-generate-video',
      'ai-lip-sync',
      'ai-llm',
      'ai-prompt-constructor',
      'ai-reframe',
      'ai-text-to-speech',
      'ai-transcribe',
      'ai-upscale',
      'ai-voice-change',
      'control-branch',
      'reviewGate',
      'control-delay',
      'effect-captions',
      'effect-color-grade',
      'effect-ken-burns',
      'effect-portrait-blur',
      'effect-split-screen',
      'effect-text-overlay',
      'effect-watermark',
      'input-image',
      'input-prompt',
      'input-template',
      'input-video',
      'trendTrigger',
      'sendEmail',
      'trendDigest',
      'output-export',
      'output-notify',
      'output-publish',
      'output-save',
      'output-webhook',
      'process-compress',
      'process-extract-audio',
      'process-merge-videos',
      'process-mirror',
      'process-resize',
      'process-reverse',
      'process-transform',
      'process-trim',
    ]);
  });

  it('keeps representative definitions and source-corpus limits available', () => {
    expect(getNodeDefinition('ai-generate-image')).toMatchObject({
      category: 'ai',
      icon: 'Sparkles',
      label: 'Generate Image',
    });
    expect(getNodeDefinition('talkingHeadScript')).toMatchObject({
      category: 'ai',
      configSchema: {
        clipCount: { default: 5, max: 20, min: 2 },
        durationSeconds: { default: 30, max: 300, min: 1 },
        wordsPerSecond: { default: 3.5, max: 6, min: 1 },
      },
      icon: 'FileText',
      label: 'Talking-head Script',
    });
    expect(getNodeDefinition('effect-watermark')).toMatchObject({
      category: 'effects',
      icon: 'ShieldCheck',
      label: 'Add Watermark',
    });
    expect(SOURCE_CORPUS_CONFIG_LIMITS).toEqual({
      days: { default: 7, max: 30, min: 1 },
      limit: { default: 50, max: 100, min: 1 },
    });
  });

  it('keeps connection compatibility behavior stable', () => {
    expect(
      validateConnection('input-image', 'image', 'ai-generate-image', 'image'),
    ).toBe(true);
    expect(
      validateConnection(
        'input-prompt',
        'prompt',
        'ai-generate-image',
        'image',
      ),
    ).toBe(false);
    expect(getCompatibleNodes('missing-node', 'value')).toEqual([]);
  });
});
