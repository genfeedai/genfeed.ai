import { describe, expect, it } from 'vitest';
import {
  getLongFormVideoScriptNarration,
  isLongFormVideoBeatVisualType,
  LONG_FORM_VIDEO_SCRIPT_LIMITS,
  parseLongFormVideoScript,
  sumLongFormVideoBeatSeconds,
} from './long-form-video-script.interface';

function validScript(): Record<string, unknown> {
  return {
    beats: [
      {
        id: 'beat-1',
        narration: 'Here is the thing nobody tells you.',
        targetDurationSeconds: 20,
        title: 'Hook',
        visualType: 'presenter',
      },
      {
        id: 'beat-2',
        narration: 'The numbers tell a different story.',
        targetDurationSeconds: 40,
        title: 'The data',
        visualBrief: 'Animated bar chart of monthly growth',
        visualType: 'motion-graphic',
      },
    ],
    hook: 'Nobody tells you this.',
    language: 'en',
    revision: 1,
    targetDurationSeconds: 60,
    title: 'What nobody tells you',
  };
}

describe('long-form video script contract', () => {
  it('accepts the documented beat visual types only', () => {
    expect(isLongFormVideoBeatVisualType('presenter')).toBe(true);
    expect(isLongFormVideoBeatVisualType('b-roll')).toBe(true);
    expect(isLongFormVideoBeatVisualType('slideshow')).toBe(false);
  });

  it('parses a valid script and trims its text', () => {
    const input = validScript();
    input.title = '  What nobody tells you  ';

    const result = parseLongFormVideoScript(input);

    expect(result.isValid).toBe(true);
    if (!result.isValid) return;
    expect(result.script.title).toBe('What nobody tells you');
    expect(result.script.beats).toHaveLength(2);
    expect(result.script.beats[0]).not.toHaveProperty('visualBrief');
    expect(result.script.beats[1].visualBrief).toBe(
      'Animated bar chart of monthly growth',
    );
  });

  it('rejects a value that is not an object', () => {
    expect(parseLongFormVideoScript(null)).toEqual({
      issues: [{ message: 'Must be an object', path: '' }],
      isValid: false,
    });
  });

  it('reports every issue with its path', () => {
    const input = validScript();
    input.title = '';
    input.targetDurationSeconds = 5;
    input.revision = 0;

    const result = parseLongFormVideoScript(input);

    expect(result.isValid).toBe(false);
    if (result.isValid) return;
    expect(result.issues.map((issue) => issue.path).sort()).toEqual([
      'revision',
      'targetDurationSeconds',
      'title',
    ]);
  });

  it('requires at least one beat and caps the beat count', () => {
    const empty = parseLongFormVideoScript({ ...validScript(), beats: [] });
    expect(empty.isValid).toBe(false);

    const beat = (validScript().beats as unknown[])[0];
    const tooMany = parseLongFormVideoScript({
      ...validScript(),
      beats: Array.from(
        { length: LONG_FORM_VIDEO_SCRIPT_LIMITS.maxBeats + 1 },
        () => beat,
      ),
    });
    expect(tooMany.isValid).toBe(false);
  });

  it('rejects duplicate beat ids', () => {
    const input = validScript();
    const beats = input.beats as Array<Record<string, unknown>>;
    beats[1].id = 'beat-1';

    const result = parseLongFormVideoScript(input);

    expect(result.isValid).toBe(false);
    if (result.isValid) return;
    expect(result.issues).toContainEqual({
      message: 'Must be unique',
      path: 'beats[1].id',
    });
  });

  it('requires a visual brief on cutaway beats but not presenter beats', () => {
    const input = validScript();
    const beats = input.beats as Array<Record<string, unknown>>;
    delete beats[1].visualBrief;

    const result = parseLongFormVideoScript(input);

    expect(result.isValid).toBe(false);
    if (result.isValid) return;
    expect(result.issues).toEqual([
      {
        message: 'Required when the beat is not a presenter beat',
        path: 'beats[1].visualBrief',
      },
    ]);
  });

  it('rejects a beat whose narration exceeds one speech chunk', () => {
    const input = validScript();
    const beats = input.beats as Array<Record<string, unknown>>;
    beats[0].narration = 'a'.repeat(
      LONG_FORM_VIDEO_SCRIPT_LIMITS.maxBeatNarrationCharacters + 1,
    );

    const result = parseLongFormVideoScript(input);

    expect(result.isValid).toBe(false);
    if (result.isValid) return;
    expect(result.issues[0].path).toBe('beats[0].narration');
  });

  it('joins narration in beat order and sums beat durations', () => {
    const result = parseLongFormVideoScript(validScript());
    if (!result.isValid) throw new Error('expected a valid script');

    expect(getLongFormVideoScriptNarration(result.script)).toBe(
      'Here is the thing nobody tells you.\n\nThe numbers tell a different story.',
    );
    expect(sumLongFormVideoBeatSeconds(result.script)).toBe(60);
  });
});
