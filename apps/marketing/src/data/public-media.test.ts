import { describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apps: { app: 'https://app.example.test' } },
}));

import {
  buildRecreateHref,
  buildRecreatePrompt,
  formatCompactCount,
  formatMediaDuration,
  mediaDurationSeconds,
  mediaModelKey,
} from './public-media';

describe('mediaModelKey', () => {
  it.each([
    [{ model: 'veo-3' }, 'veo-3'],
    [{ metadata: { id: 'm1', model: 'flux-pro' } }, 'flux-pro'],
    [{ metadata: { id: 'm1', model: 'flux-pro' }, model: 'veo-3' }, 'veo-3'],
    [{ metadata: 'm1' }, undefined],
    [{}, undefined],
  ])('reads %j as %j', (item, expected) => {
    expect(mediaModelKey(item)).toBe(expected);
  });
});

describe('mediaDurationSeconds', () => {
  it.each([
    [{ metadata: { duration: 8.4, id: 'm1' } }, 8],
    [{ metadata: { duration: 0, id: 'm1' } }, undefined],
    [{ metadata: 'm1' }, undefined],
    [{}, undefined],
  ])('reads %j as %j', (item, expected) => {
    expect(mediaDurationSeconds(item)).toBe(expected);
  });
});

describe('formatMediaDuration', () => {
  it.each([
    [8, '0:08'],
    [65, '1:05'],
    [600, '10:00'],
  ])('shows %i seconds as %s', (seconds, expected) => {
    expect(formatMediaDuration(seconds)).toBe(expected);
  });
});

describe('formatCompactCount', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1284, '1.3K'],
    [2_500_000, '2.5M'],
  ])('shows %i as %s', (count, expected) => {
    expect(formatCompactCount(count)).toBe(expected);
  });
});

describe('buildRecreatePrompt', () => {
  it.each([
    [
      'video' as const,
      { handle: 'genfeedai', modelLabel: 'Veo 3' },
      "Make a video like @genfeedai's on genfeed.ai with Veo 3",
    ],
    [
      'image' as const,
      { handle: 'ana' },
      "Make an image like @ana's on genfeed.ai",
    ],
    [
      'image' as const,
      { isFeatured: true, modelLabel: 'Flux Pro' },
      'Make an image like the one featured on genfeed.ai/community with Flux Pro',
    ],
    ['video' as const, {}, 'Make a video like the one I saw on genfeed.ai'],
  ])('asks for a %s like the one seen', (kind, source, expected) => {
    expect(buildRecreatePrompt(kind, source)).toBe(expected);
  });
});

describe('buildRecreateHref', () => {
  it('opens the agent in manual mode with the prompt filled in', () => {
    expect(buildRecreateHref('Make an image like the one I saw')).toBe(
      'https://app.example.test/agent/new?agentMode=manual&prompt=Make+an+image+like+the+one+I+saw',
    );
  });
});
