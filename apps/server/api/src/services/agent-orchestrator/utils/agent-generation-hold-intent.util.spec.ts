import { hasGenerationHoldIntent } from '@api/services/agent-orchestrator/utils/agent-generation-hold-intent.util';
import { describe, expect, it } from 'vitest';

describe('hasGenerationHoldIntent', () => {
  it.each([
    'Now the 16:9 image. Show the model and credit cost, do NOT generate yet.',
    "don't generate it yet",
    'Do not generate the image until I say so',
    'Tell me what it will cost before generating',
    'Without generating anything, which model would you use?',
    'hold off on the image for now',
    'How much would that cost in credits?',
    'show me the credit estimate first',
    "Don't spend any credits yet",
    'Write the copy, but before creating the image let me see the options',
    'Check with me first on the video',
    'Wait for my approval on the visuals',
  ])('treats %j as a request to hold the generation', (message) => {
    expect(hasGenerationHoldIntent(message)).toBe(true);
  });

  it.each([
    'Generate the 16:9 image for the strongest draft.',
    'Yes, go ahead and create the image',
    'Make the image warmer and generate it again',
    'Write three X post drafts for the spring field kit',
    'Use my credits to generate the image now',
    'Create the video, I already approved the cost',
    '',
  ])('leaves %j to the thread mode', (message) => {
    expect(hasGenerationHoldIntent(message)).toBe(false);
  });

  it('does not match when there is no operator message', () => {
    expect(hasGenerationHoldIntent(null)).toBe(false);
    expect(hasGenerationHoldIntent(undefined)).toBe(false);
  });
});
