import {
  slotsUsedByTemplate,
  structuredPromptFromSource,
} from '@api/services/prompt-builder/utils/structured-prompt.util';

describe('structuredPromptFromSource', () => {
  it('maps request fields to slots and the blacklist to avoid', () => {
    expect(
      structuredPromptFromSource({
        blacklist: ['text'],
        camera: ' wide angle ',
        mood: '',
        sounds: ['rain'],
        subject: 'a fox',
      }),
    ).toEqual({
      avoid: ['text'],
      camera: 'wide angle',
      sounds: ['rain'],
      subject: 'a fox',
    });
  });

  it('returns no slots for an empty request', () => {
    expect(structuredPromptFromSource({})).toEqual({});
  });
});

describe('slotsUsedByTemplate', () => {
  it('finds slots placed with plain, triple-brace and block expressions', () => {
    expect(
      slotsUsedByTemplate(
        '{{{prompt}}} {{mood}} {{#if camera}}shot on {{camera}}{{/if}} {{{lighting}}}',
      ),
    ).toEqual(['camera', 'lighting', 'mood']);
  });

  it('does not match a slot name inside plain text or a longer variable', () => {
    expect(
      slotsUsedByTemplate('A mood piece. {{{prompt}}} {{brandStyle}}'),
    ).toEqual([]);
  });

  it('reads the blacklist variable as the avoid slot', () => {
    expect(slotsUsedByTemplate('{{{prompt}}} without {{blacklist}}')).toEqual([
      'avoid',
    ]);
  });

  it('returns nothing without a template', () => {
    expect(slotsUsedByTemplate(undefined)).toEqual([]);
  });
});
