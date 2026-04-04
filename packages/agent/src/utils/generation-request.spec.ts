import { RouterPriority } from '@genfeedai/enums';

import {
  buildAgentGenerationRequestBody,
  DEFAULT_AGENT_GENERATION_PRIORITY,
  getDimensionsForAspectRatio,
  getPromptCategoryForGenerationType,
} from './generation-request';

describe('generation-request', () => {
  it('maps generation types to prompt categories', () => {
    expect(getPromptCategoryForGenerationType('image')).toBe(
      'models-prompt-image',
    );
    expect(getPromptCategoryForGenerationType('video')).toBe(
      'models-prompt-video',
    );
  });

  it('resolves known aspect ratios and falls back to square', () => {
    expect(getDimensionsForAspectRatio('16:9')).toEqual({
      height: 576,
      width: 1024,
    });
    expect(getDimensionsForAspectRatio('unknown')).toEqual({
      height: 1024,
      width: 1024,
    });
  });

  it('builds a generation request body with defaults', () => {
    expect(
      buildAgentGenerationRequestBody({
        aspectRatio: '1:1',
        promptId: 'prompt-1',
        promptText: 'Prompt',
      }),
    ).toEqual({
      autoSelectModel: true,
      height: 1024,
      prioritize: DEFAULT_AGENT_GENERATION_PRIORITY,
      prompt: 'prompt-1',
      text: 'Prompt',
      width: 1024,
    });
  });

  it('builds a generation request body with manual model and video options', () => {
    expect(
      buildAgentGenerationRequestBody({
        aspectRatio: '16:9',
        duration: 8,
        modelKey: 'video-model',
        prioritize: RouterPriority.SPEED,
        promptId: 'prompt-2',
        promptText: 'Video prompt',
        waitForCompletion: true,
      }),
    ).toEqual({
      autoSelectModel: false,
      duration: 8,
      height: 576,
      model: 'video-model',
      prioritize: RouterPriority.SPEED,
      prompt: 'prompt-2',
      text: 'Video prompt',
      waitForCompletion: true,
      width: 1024,
    });
  });
});
