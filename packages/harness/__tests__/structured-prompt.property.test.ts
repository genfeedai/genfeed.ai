import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  normalizeStructuredPrompt,
  renderStructuredPrompt,
  STRUCTURED_PROMPT_LIST_SLOTS,
  STRUCTURED_PROMPT_TEXT_SLOTS,
  type StructuredPromptSlot,
} from '../src/structured-prompt';

/** Plain lowercase words: no markup, no repeated spaces, no empty values. */
const wordsArbitrary = fc.stringMatching(/^[a-z]{2,10}( [a-z]{2,10}){0,2}$/);

const structuredPromptArbitrary = fc.record(
  {
    action: wordsArbitrary,
    avoid: fc.array(wordsArbitrary, { maxLength: 4 }),
    camera: wordsArbitrary,
    cameraMovement: wordsArbitrary,
    lens: wordsArbitrary,
    lighting: wordsArbitrary,
    mood: wordsArbitrary,
    scene: wordsArbitrary,
    sounds: fc.array(wordsArbitrary, { maxLength: 4 }),
    speech: wordsArbitrary,
    style: wordsArbitrary,
    subject: wordsArbitrary,
  },
  { requiredKeys: [] },
);

/** Whatever a request body or database row can hold in a slot, short enough to stay under the length cap. */
const messyTextArbitrary = fc.string({ maxLength: 120 });
const messyPromptArbitrary = fc.record(
  {
    action: messyTextArbitrary,
    avoid: fc.array(messyTextArbitrary, { maxLength: 20 }),
    camera: messyTextArbitrary,
    cameraMovement: messyTextArbitrary,
    lens: messyTextArbitrary,
    lighting: messyTextArbitrary,
    mood: messyTextArbitrary,
    scene: messyTextArbitrary,
    sounds: fc.array(messyTextArbitrary, { maxLength: 20 }),
    speech: messyTextArbitrary,
    style: messyTextArbitrary,
    subject: messyTextArbitrary,
  },
  { requiredKeys: [] },
);

const allSlots: StructuredPromptSlot[] = [
  ...STRUCTURED_PROMPT_TEXT_SLOTS,
  ...STRUCTURED_PROMPT_LIST_SLOTS,
];
const skipArbitrary = fc.subarray(allSlots);

describe('normalizeStructuredPrompt properties', () => {
  it('is idempotent', () => {
    fc.assert(
      fc.property(messyPromptArbitrary, (input) => {
        const once = normalizeStructuredPrompt(input);

        expect(normalizeStructuredPrompt(once)).toEqual(once);
      }),
    );
  });

  it('keeps only trimmed, single-spaced, non-empty text and bounded unique lists', () => {
    fc.assert(
      fc.property(messyPromptArbitrary, (input) => {
        const result = normalizeStructuredPrompt(input);

        for (const slot of STRUCTURED_PROMPT_TEXT_SLOTS) {
          const value = result[slot];
          if (value !== undefined) {
            expect(value).not.toBe('');
            expect(value).toBe(value.replace(/\s+/g, ' ').trim());
          }
        }
        for (const slot of STRUCTURED_PROMPT_LIST_SLOTS) {
          const values = result[slot];
          if (values !== undefined) {
            expect(values.length).toBeGreaterThan(0);
            expect(values.length).toBeLessThanOrEqual(12);
            expect(new Set(values).size).toBe(values.length);
            expect(values.every((value) => value.length > 0)).toBe(true);
          }
        }
      }),
    );
  });
});

describe('renderStructuredPrompt properties', () => {
  it('renders the same text for the same input, raw or already normalized', () => {
    fc.assert(
      fc.property(
        messyPromptArbitrary,
        fc.constantFrom('prose', 'tagged'),
        fc.boolean(),
        (input, target, hasAudio) => {
          const options = { hasAudio, target } as const;
          const rendered = renderStructuredPrompt(input, options);

          expect(renderStructuredPrompt(input, options)).toEqual(rendered);
          expect(
            renderStructuredPrompt(normalizeStructuredPrompt(input), options),
          ).toEqual(rendered);
        },
      ),
    );
  });

  it('never renders a skipped slot', () => {
    fc.assert(
      fc.property(
        structuredPromptArbitrary,
        skipArbitrary,
        fc.constantFrom('prose', 'tagged'),
        fc.boolean(),
        (input, skip, target, hasAudio) => {
          const rendered = renderStructuredPrompt(input, {
            hasAudio,
            skip,
            target,
          });

          for (const slot of skip) {
            expect(rendered.usedSlots).not.toContain(slot);
          }
        },
      ),
    );
  });

  it('keeps the written prompt first and leaves no stray spacing in prose', () => {
    fc.assert(
      fc.property(
        structuredPromptArbitrary,
        wordsArbitrary,
        fc.boolean(),
        (input, lead, hasAudio) => {
          const { prompt } = renderStructuredPrompt(input, { hasAudio, lead });

          expect(prompt.startsWith(lead)).toBe(true);
          expect(prompt).toBe(prompt.trim());
          expect(prompt).not.toMatch(/\s{2,}/);
        },
      ),
    );
  });

  it('never folds the avoid list into prose and sends it as the negative prompt', () => {
    fc.assert(
      fc.property(
        structuredPromptArbitrary,
        fc.boolean(),
        (input, hasAudio) => {
          const rendered = renderStructuredPrompt(input, { hasAudio });
          const avoid = input.avoid ?? [];

          expect(rendered.usedSlots).not.toContain('avoid');
          if (avoid.length === 0) {
            expect(rendered.negativePrompt).toBeUndefined();
          } else {
            expect(rendered.negativePrompt).toBe(
              normalizeStructuredPrompt(input).avoid?.join(', '),
            );
          }
        },
      ),
    );
  });

  it('drops sounds and speech for a model without audio, and keeps them for one with audio', () => {
    fc.assert(
      fc.property(structuredPromptArbitrary, (input) => {
        const silent = renderStructuredPrompt(input, { hasAudio: false });
        const audible = renderStructuredPrompt(input, { hasAudio: true });

        expect(silent.usedSlots).not.toContain('sounds');
        expect(silent.usedSlots).not.toContain('speech');
        expect(audible.usedSlots.includes('sounds')).toBe(
          (input.sounds ?? []).length > 0,
        );
        expect(audible.usedSlots.includes('speech')).toBe(
          input.speech !== undefined,
        );
      }),
    );
  });

  it('does not repeat a subject the written prompt already mentions', () => {
    fc.assert(
      fc.property(
        structuredPromptArbitrary,
        wordsArbitrary,
        (input, subject) => {
          const { usedSlots } = renderStructuredPrompt(
            { ...input, subject },
            { lead: `${subject} walking home` },
          );

          expect(usedSlots).not.toContain('subject');
        },
      ),
    );
  });

  it('escapes slot text so every tagged line is one well-formed element', () => {
    fc.assert(
      fc.property(messyPromptArbitrary, wordsArbitrary, (input, lead) => {
        const { prompt, usedSlots } = renderStructuredPrompt(input, {
          lead,
          target: 'tagged',
        });
        const lines = prompt === '' ? [] : prompt.split('\n');

        expect(lines).toHaveLength(usedSlots.length + 1);
        for (const line of lines) {
          expect(line).toMatch(/^<([a-zA-Z]+)>[^<>]*<\/\1>$/);
        }
      }),
    );
  });
});
