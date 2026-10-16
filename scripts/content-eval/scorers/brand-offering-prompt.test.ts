import {
  classifyBrandOffering,
  scoreBrandOfferingPrompt,
} from '@genfeedai/helpers/brand/brand-offering.helper';
import { describe, expect, it } from 'vitest';

const RECRUITING_SOFTWARE =
  'Hiring software for recruiters. Candidates move through an ATS and a CRM.';

const CORPUS: readonly {
  kind: 'software';
  output: string;
  passes: boolean;
  userPrompt: string;
}[] = [
  {
    kind: 'software',
    output: 'Close-up of wireless earbuds on a marble table.',
    passes: false,
    userPrompt: 'Open on the product.',
  },
  {
    kind: 'software',
    output: 'A matte bottle rotates under studio light.',
    passes: false,
    userPrompt: 'Short product ad.',
  },
  {
    kind: 'software',
    output: 'A recruiter exhales when the right person accepts.',
    passes: true,
    userPrompt: 'Show the feeling of being chosen.',
  },
  {
    kind: 'software',
    output: 'Two people shake hands after the role is filled.',
    passes: true,
    userPrompt: 'End on the brand.',
  },
];

describe('brand offering prompt eval', () => {
  it('classifies a synthetic recruiting platform as software', () => {
    expect(classifyBrandOffering(RECRUITING_SOFTWARE)).toBe('software');
  });

  it('rejects invented objects and keeps the human outcome', () => {
    for (const sample of CORPUS) {
      expect(
        scoreBrandOfferingPrompt({
          kind: classifyBrandOffering(RECRUITING_SOFTWARE),
          output: sample.output,
          userPrompt: sample.userPrompt,
        }).isPass,
      ).toBe(sample.passes);
    }
  });
});
