import { describe, expect, it } from 'vitest';

import {
  buildHeyGenVideoTranslationBody,
  heyGenVideoTranslationStatusUrl,
  isHeyGenVideoTranslationTerminal,
  readHeyGenVideoTranslationId,
  readHeyGenVideoTranslationStatus,
} from './heygen-video-translation';

describe('HeyGen Video Translation helper', () => {
  it('builds the body with unique languages and an https source', () => {
    expect(
      buildHeyGenVideoTranslationBody({
        languages: ['es', ' fr ', 'es', ''],
        videoUrl: 'https://cdn.test/source.mp4',
      }),
    ).toEqual({
      output_languages: ['es', 'fr'],
      video: { type: 'url', url: 'https://cdn.test/source.mp4' },
    });
  });

  it.each([
    [
      { languages: ['es'], videoUrl: 'http://cdn.test/a.mp4' },
      'https video URL',
    ],
    [
      { languages: [' '], videoUrl: 'https://cdn.test/a.mp4' },
      'at least one language',
    ],
  ])('refuses an invalid request: %j', (input, message) => {
    expect(() => buildHeyGenVideoTranslationBody(input)).toThrow(message);
  });

  it('builds the poll URL', () => {
    expect(heyGenVideoTranslationStatusUrl('t 1')).toBe(
      'https://api.heygen.com/v3/video-translations/t%201',
    );
  });

  it.each([
    [{ data: { video_translation_id: 't1' } }, 't1'],
    [{ data: { id: 't2' } }, 't2'],
    [{ data: {} }, undefined],
  ])('reads the id from %j', (payload, expected) => {
    expect(readHeyGenVideoTranslationId(payload)).toBe(expected);
  });

  it('keeps only outputs that have a language and an https URL', () => {
    expect(
      readHeyGenVideoTranslationStatus({
        data: {
          outputs: [
            { language: 'es', video_url: 'https://cdn.test/es.mp4' },
            { language: 'fr', video_url: 'http://cdn.test/fr.mp4' },
            { video_url: 'https://cdn.test/none.mp4' },
          ],
          status: 'completed',
        },
      }),
    ).toEqual({
      outputs: [{ language: 'es', videoUrl: 'https://cdn.test/es.mp4' }],
      status: 'completed',
    });
    expect(readHeyGenVideoTranslationStatus(undefined)).toEqual({
      outputs: [],
      status: 'pending',
    });
  });

  it.each([
    ['completed', true],
    ['failed', true],
    ['pending', false],
    ['running', false],
  ])('treats %s as terminal: %s', (status, expected) => {
    expect(isHeyGenVideoTranslationTerminal(status)).toBe(expected);
  });
});
