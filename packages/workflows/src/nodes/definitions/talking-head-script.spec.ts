import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TALKING_HEAD_SCRIPT_DATA,
  talkingHeadScriptNodeDefinition,
} from './talking-head-script';

describe('talking-head-script node', () => {
  it('defaults to a 30-second, five-clip script at 3.5 words per second', () => {
    expect(DEFAULT_TALKING_HEAD_SCRIPT_DATA).toMatchObject({
      clipCount: 5,
      durationSeconds: 30,
      language: 'en',
      label: 'Talking-head Script',
      status: 'idle',
      type: 'talkingHeadScript',
      wordsPerSecond: 3.5,
    });
  });

  it('accepts product, brand, harness, timing, pacing, and language inputs', () => {
    expect(talkingHeadScriptNodeDefinition.inputs).toEqual([
      {
        id: 'productContext',
        label: 'Product Context',
        required: true,
        type: 'text',
      },
      {
        id: 'brandVoice',
        label: 'Brand Voice',
        required: false,
        type: 'text',
      },
      {
        id: 'harnessContext',
        label: 'Harness Context',
        required: false,
        type: 'object',
      },
      {
        id: 'durationSeconds',
        label: 'Duration (seconds)',
        required: false,
        type: 'number',
      },
      {
        id: 'clipCount',
        label: 'Clip Count',
        required: false,
        type: 'number',
      },
      {
        id: 'wordsPerSecond',
        label: 'Words per Second',
        required: false,
        type: 'number',
      },
      {
        id: 'language',
        label: 'Language',
        required: false,
        type: 'text',
      },
    ]);
  });

  it('exposes the typed contract and downstream scalar handles', () => {
    expect(talkingHeadScriptNodeDefinition.outputs).toEqual([
      { id: 'script', label: 'Timed Script', type: 'object' },
      { id: 'segments', label: 'Segments', type: 'object' },
      { id: 'fullText', label: 'Full Script', type: 'text' },
      { id: 'clipCount', label: 'Clip Count', type: 'number' },
      {
        id: 'totalDurationSeconds',
        label: 'Total Duration (seconds)',
        type: 'number',
      },
      {
        id: 'totalTargetWordCount',
        label: 'Target Words',
        type: 'number',
      },
      { id: 'totalWordCount', label: 'Actual Words', type: 'number' },
      {
        id: 'wordsPerSecond',
        label: 'Words per Second',
        type: 'number',
      },
    ]);
  });
});
