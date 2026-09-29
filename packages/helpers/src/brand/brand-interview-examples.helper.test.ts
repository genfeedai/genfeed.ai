import { describe, expect, it } from 'vitest';
import { personalizeBrandInterviewExamples } from './brand-interview-examples.helper';

describe('personalizeBrandInterviewExamples', () => {
  it('falls back to "your brand" without a label', () => {
    expect(
      personalizeBrandInterviewExamples(['Hello Acme'], { brandName: '  ' }),
    ).toEqual(['Hello your brand']);
  });
});
