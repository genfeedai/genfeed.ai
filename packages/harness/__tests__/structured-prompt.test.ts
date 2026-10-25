import { describe, expect, it } from 'vitest';
import {
  hasStructuredPrompt,
  normalizeStructuredPrompt,
  renderStructuredPrompt,
} from '../src/structured-prompt';

describe('normalizeStructuredPrompt', () => {
  it('trims, drops empty slots and ignores unknown keys', () => {
    expect(
      normalizeStructuredPrompt({
        camera: '  handheld   ',
        lighting: '   ',
        mood: 42,
        sounds: [' rain ', 'rain', '', 7],
        unknown: 'x',
        subject: 'a fox',
      } as Record<string, unknown>),
    ).toEqual({ camera: 'handheld', sounds: ['rain'], subject: 'a fox' });
  });

  it('caps slot length and list size', () => {
    const result = normalizeStructuredPrompt({
      avoid: Array.from({ length: 30 }, (_, index) => `item ${index}`),
      subject: 'x'.repeat(1000),
    });
    expect(result.subject).toHaveLength(400);
    expect(result.avoid).toHaveLength(12);
  });

  it('accepts null and undefined', () => {
    expect(normalizeStructuredPrompt(null)).toEqual({});
    expect(normalizeStructuredPrompt(undefined)).toEqual({});
  });
});

describe('hasStructuredPrompt', () => {
  it('is false for empty slots and true once one is filled', () => {
    expect(hasStructuredPrompt({ camera: ' ' })).toBe(false);
    expect(hasStructuredPrompt(null)).toBe(false);
    expect(hasStructuredPrompt({ camera: 'dolly' })).toBe(true);
  });
});

describe('renderStructuredPrompt (prose)', () => {
  it('keeps the written prompt first and appends each filled slot as a sentence', () => {
    const rendered = renderStructuredPrompt(
      {
        action: 'walking through rain',
        camera: 'handheld',
        cameraMovement: 'slow push in',
        lens: '35mm',
        lighting: 'neon glow',
        mood: 'melancholy',
        scene: 'night market',
        style: 'cinematic',
        subject: 'a courier',
      },
      { lead: 'Neon street at night' },
    );
    expect(rendered.prompt).toBe(
      'Neon street at night. A courier walking through rain. Scene: night market. Camera: handheld, 35mm lens. Camera movement: slow push in. Lighting: neon glow. Style: cinematic, melancholy mood.',
    );
    expect(rendered.target).toBe('prose');
    expect(rendered.usedSlots).toEqual([
      'subject',
      'action',
      'scene',
      'camera',
      'lens',
      'cameraMovement',
      'lighting',
      'style',
      'mood',
    ]);
  });

  it('emits no tags or JSON', () => {
    const { prompt } = renderStructuredPrompt(
      { camera: 'crane', subject: 'a ship' },
      { lead: 'harbor' },
    );
    expect(prompt).not.toMatch(/[<>{}]/);
  });

  it('starts from the subject when there is no written prompt', () => {
    expect(
      renderStructuredPrompt({ action: 'running', subject: 'a dog' }).prompt,
    ).toBe('A dog running.');
  });

  it('does not repeat a value the written prompt already mentions', () => {
    const rendered = renderStructuredPrompt(
      { lighting: 'golden hour', style: 'cinematic' },
      { lead: 'A cinematic shot of a beach' },
    );
    expect(rendered.prompt).toBe(
      'A cinematic shot of a beach. Lighting: golden hour.',
    );
    expect(rendered.usedSlots).toEqual(['lighting']);
  });

  it('returns the written prompt untouched when nothing is left to add', () => {
    expect(
      renderStructuredPrompt({ style: 'cinematic' }, { lead: 'cinematic sky' })
        .prompt,
    ).toBe('cinematic sky');
  });

  it('describes a lens without a camera on its own', () => {
    expect(renderStructuredPrompt({ lens: '85mm' }).prompt).toBe('Lens: 85mm.');
  });

  it('drops audio slots unless the model generates audio', () => {
    const fields = { sounds: ['rain', 'distant traffic'], speech: 'Hello' };
    expect(renderStructuredPrompt(fields, { lead: 'a street' }).prompt).toBe(
      'a street',
    );
    expect(
      renderStructuredPrompt(fields, { hasAudio: true, lead: 'a street' })
        .prompt,
    ).toBe('a street. Audio: rain, distant traffic. Spoken line: "Hello"');
  });

  it('sends the avoid list as a negative prompt, not as prose', () => {
    const rendered = renderStructuredPrompt(
      { avoid: ['blur', 'text'], mood: 'calm' },
      { lead: 'lake' },
    );
    expect(rendered.negativePrompt).toBe('blur, text');
    expect(rendered.prompt).toBe('lake. Mood: calm.');
  });

  it('skips slots the caller renders elsewhere', () => {
    const rendered = renderStructuredPrompt(
      { camera: 'crane', mood: 'calm' },
      { lead: 'lake', skip: ['mood'] },
    );
    expect(rendered.prompt).toBe('lake. Camera: crane.');
  });

  it('is deterministic', () => {
    const fields = { camera: 'crane', lighting: 'dusk' };
    expect(renderStructuredPrompt(fields, { lead: 'lake' })).toEqual(
      renderStructuredPrompt(fields, { lead: 'lake' }),
    );
  });
});

describe('renderStructuredPrompt (tagged)', () => {
  it('wraps each slot in a tag for LLM steps and escapes markup', () => {
    const rendered = renderStructuredPrompt(
      {
        avoid: ['blur'],
        camera: 'crane <shot>',
        sounds: ['rain'],
        subject: 'a ship',
      },
      { lead: 'harbor & dusk', target: 'tagged' },
    );
    expect(rendered.prompt).toBe(
      [
        '<prompt>harbor &amp; dusk</prompt>',
        '<subject>a ship</subject>',
        '<camera>crane &lt;shot&gt;</camera>',
        '<sounds>rain</sounds>',
        '<avoid>blur</avoid>',
      ].join('\n'),
    );
    expect(rendered.target).toBe('tagged');
  });
});
