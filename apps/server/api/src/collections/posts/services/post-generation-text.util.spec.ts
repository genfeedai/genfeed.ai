import {
  extractPostGenerationLabel,
  isUnusableDraftText,
  parsePostGenerationSlots,
} from '@api/collections/posts/services/post-generation-text.util';

describe('post generation text parsing', () => {
  it('ignores blank line separators without consuming thread positions', () => {
    expect(parsePostGenerationSlots('Reply one\n\nReply two', 2)).toEqual([
      'Reply one',
      'Reply two',
    ]);
  });

  it('keeps each numbered post whole, with its line breaks and without the lead-in', () => {
    expect(
      parsePostGenerationSlots(
        'Here is your thread:\n\n1/ Season it twice.\nWipe, never soak.\n\n2/ Dry it on the hob.\n\n3/ Oil it thin.',
        3,
      ),
    ).toEqual([
      'Season it twice.\nWipe, never soak.',
      'Dry it on the hob.',
      'Oil it thin.',
    ]);
  });

  it('falls back to lines when the numbers do not count up from 1', () => {
    expect(
      parsePostGenerationSlots('Two rules\n1. Season it\n3. Oil it', 2),
    ).toEqual(['Two rules', 'Season it']);
  });

  it('keeps a leading figure instead of stripping it as a number prefix', () => {
    expect(
      parsePostGenerationSlots(
        JSON.stringify([
          '2.5 million pans ship every year.',
          '3-step care: wipe, dry, oil.',
          '10x the lifespan.',
        ]),
        3,
      ),
    ).toEqual([
      '2.5 million pans ship every year.',
      '3-step care: wipe, dry, oil.',
      '10x the lifespan.',
    ]);
  });

  it('extracts a whitespace-normalized label without markup', () => {
    expect(
      extractPostGenerationLabel('<p>Hello <strong>launch</strong></p>'),
    ).toBe('Hello launch');
  });

  it('preserves malformed markup text and caps the label', () => {
    expect(extractPostGenerationLabel('Hello <unfinished')).toBe(
      'Hello <unfinished',
    );
    expect(extractPostGenerationLabel('word '.repeat(20), 20)).toBe(
      'word word word word...',
    );
  });
});

describe('isUnusableDraftText', () => {
  it.each([
    "I need more information about the brand's offering before I can write this.",
    "I'm sorry, but I can't write a post without knowing what the brand sells.",
    'Could you please share what the brand sells?',
    "Here's your post: Cast iron lasts a lifetime.",
    'Sure! Here is a draft for you.',
    'Unfortunately, the brand profile is empty.',
    "Unfortunately, I can't write this without knowing what the brand sells.",
    'I\u2019m sorry, but I can\u2019t write this post.',
    'Here\u2019s your post: Cast iron lasts a lifetime.',
    'Absolutely! Here is a draft for you.',
    'Can you provide me more detail about the offering?',
    'Please provide more information about the brand.',
  ])('rejects a reply addressed to the user: %s', (text) => {
    expect(isUnusableDraftText(text)).toBe(true);
  });

  it.each([
    "I can't help but love a pan that outlives its owner.",
    "Here's the thing about cast iron: it gets better with every meal.",
    'We need more hands in the kitchen, so we built a pan for two.',
    'Cast iron pans, 25% off until Friday.',
    'Unfortunately, our workshop is closed today. Online orders remain open.',
    'Unfortunately, I will be closing the workshop today. Online orders remain open.',
    'Absolutely! Our pans ship free this week.',
    'Can you share your favorite pan with us?',
    'Please share this with a friend who loves to cook.',
    'Sorry, not sorry: we only make pans that last.',
  ])('keeps a real post that only sounds similar: %s', (text) => {
    expect(isUnusableDraftText(text)).toBe(false);
  });

  it('rejects a draft shorter than the minimum, ignoring markup and spacing', () => {
    expect(isUnusableDraftText('<p>Cast   iron</p>', 20)).toBe(true);
    expect(
      isUnusableDraftText('Cast iron pans that last a lifetime.', 20),
    ).toBe(false);
  });

  it('has no minimum unless the caller sets one', () => {
    expect(isUnusableDraftText('gm')).toBe(false);
  });
});
