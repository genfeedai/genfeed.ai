import { describe, expect, it } from 'vitest';
import {
  AgentGenerationMode,
  inferAgentMediaGenerationModeFromPrompt,
  isExplicitAgentMediaGenerationMode,
  resolveAgentTurnGenerationMode,
} from '../../src/enums/agent-generation-mode.enum';

describe('agent-generation-mode.enum', () => {
  it('uses lowercase product values', () => {
    expect(AgentGenerationMode.AUTO).toBe('auto');
    expect(AgentGenerationMode.IMAGE).toBe('image');
    expect(AgentGenerationMode.VIDEO).toBe('video');
  });

  it('treats only image and video as explicit media generation', () => {
    expect(isExplicitAgentMediaGenerationMode(AgentGenerationMode.IMAGE)).toBe(
      true,
    );
    expect(isExplicitAgentMediaGenerationMode(AgentGenerationMode.VIDEO)).toBe(
      true,
    );
    expect(isExplicitAgentMediaGenerationMode(AgentGenerationMode.AUTO)).toBe(
      false,
    );
    expect(isExplicitAgentMediaGenerationMode(undefined)).toBe(false);
  });
});

describe('inferAgentMediaGenerationModeFromPrompt', () => {
  it.each([
    'Generate an image of a red apple on a white table',
    'QA 2026-09-03: photorealistic single red apple on a seamless white studio background',
    'imagine Elon Musk riding a horse',
    'a picture of a matte white sculpture',
  ])('promotes %s to image', (prompt) => {
    expect(inferAgentMediaGenerationModeFromPrompt(prompt)).toBe(
      AgentGenerationMode.IMAGE,
    );
  });

  it.each([
    'Generate a video of waves on a beach',
    'make a 4s clip of a spinning logo',
    'animate this product hero',
  ])('promotes %s to video', (prompt) => {
    expect(inferAgentMediaGenerationModeFromPrompt(prompt)).toBe(
      AgentGenerationMode.VIDEO,
    );
  });

  it.each([
    "what's my brand voice?",
    'write a tweet about apples',
    'imagine if we doubled posting cadence',
    'schedule the draft for Friday',
    '',
  ])('leaves %s as conversation', (prompt) => {
    expect(inferAgentMediaGenerationModeFromPrompt(prompt)).toBeUndefined();
  });
});

describe('resolveAgentTurnGenerationMode', () => {
  it('keeps an explicit lock over prompt inference', () => {
    expect(
      resolveAgentTurnGenerationMode({
        generationMode: AgentGenerationMode.IMAGE,
        prompt: 'Generate a video of rain',
      }),
    ).toBe(AgentGenerationMode.IMAGE);
  });

  it('promotes Auto when the prompt is a generate request', () => {
    expect(
      resolveAgentTurnGenerationMode({
        generationMode: AgentGenerationMode.AUTO,
        prompt: 'Generate an image of a red apple',
      }),
    ).toBe(AgentGenerationMode.IMAGE);
  });
});
