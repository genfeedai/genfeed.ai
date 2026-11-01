import {
  deriveBrandRuleProposals,
  normalizeBrandRule,
} from '@api/collections/harness-profiles/utils/brand-rule-proposals.util';

describe('deriveBrandRuleProposals', () => {
  it.each([
    {
      edited: 'The editor is live.',
      expected: ['Never use "truly".'],
      name: 'a word the user cut becomes a never rule',
      original: 'The editor is truly live.',
    },
    {
      edited: 'We help you ship faster.',
      expected: ['Prefer "help" over "empower".'],
      name: 'a swapped word becomes a prefer rule',
      original: 'We empower you ship faster.',
    },
    {
      edited: 'Our new editor is live. Try it today.',
      expected: ['Prefer "Try it today" over "Check it out below".'],
      name: 'a swapped phrase is one rule, not two fragments',
      original: 'Our new editor is live. Check it out below.',
    },
    {
      edited: 'Launch day is here.',
      expected: [],
      name: 'added words alone make no rule',
      original: 'Launch day is here.',
    },
    {
      edited: 'We hit 2,000 users.',
      expected: [],
      name: 'a changed number is a fact, not a style rule',
      original: 'We hit 1,000 users.',
    },
    {
      edited: 'Thanks to @sam for the help.',
      expected: [],
      name: 'a changed handle is a fact, not a style rule',
      original: 'Thanks to @alex for the help.',
    },
    {
      edited: 'Ship it.',
      expected: [],
      name: 'a whole rewritten sentence is too long to be a rule',
      original:
        'Ship it. Honestly there is a lot of context here that the user threw away entirely.',
    },
    {
      edited: 'The editor is live!',
      expected: [],
      name: 'dropping a filler word is not a rule',
      original: 'The the editor is live!',
    },
  ])('$name', ({ edited, expected, original }) => {
    expect(deriveBrandRuleProposals({ edited, original })).toEqual(expected);
  });

  it('returns nothing when the text did not change', () => {
    expect(
      deriveBrandRuleProposals({
        edited: 'Same post, same words.',
        original: 'Same post, same words.',
      }),
    ).toEqual([]);
  });

  it('turns a rejection reason into a rule as written', () => {
    expect(
      deriveBrandRuleProposals({ reason: 'Too salesy, keep it plain' }),
    ).toEqual(['Too salesy, keep it plain.']);
  });

  it('puts the rejection reason first and caps the list at three rules', () => {
    const proposals = deriveBrandRuleProposals({
      edited: 'We ship. Come see it.',
      original: 'We truly ship. Come really see it, honestly.',
      reason: 'Sounds corporate',
    });

    expect(proposals).toEqual([
      'Sounds corporate.',
      'Never use "truly".',
      'Never use "really".',
    ]);
  });

  it('does not diff a post past the size cap', () => {
    const long = Array.from({ length: 500 }, (_, index) => `word${index}`).join(
      ' ',
    );

    expect(
      deriveBrandRuleProposals({ edited: `${long} extra`, original: long }),
    ).toEqual([]);
  });
});

describe('normalizeBrandRule', () => {
  it.each([
    ['Never use "Synergy".', 'never use synergy'],
    ['never   use synergy', 'never use synergy'],
  ])('%s', (rule, expected) => {
    expect(normalizeBrandRule(rule)).toBe(expected);
  });
});
