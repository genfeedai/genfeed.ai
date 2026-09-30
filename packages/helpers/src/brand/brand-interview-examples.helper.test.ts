import { describe, expect, it } from 'vitest';
import { personalizeBrandInterviewExamples } from './brand-interview-examples.helper';

describe('personalizeBrandInterviewExamples', () => {
  it('replaces Acme placeholders with the live brand name', () => {
    expect(
      personalizeBrandInterviewExamples(
        [
          'You are a knowledgeable assistant for Acme Inc., a startup.',
          'Acme writes short posts.',
        ],
        { brandName: 'Demo Brand' },
      ),
    ).toEqual([
      'You are a knowledgeable assistant for Demo Brand, a startup.',
      'Demo Brand writes short posts.',
    ]);
  });

  it('resolves {{brandName}} tokens', () => {
    expect(
      personalizeBrandInterviewExamples(['Write as {{brandName}}.'], {
        brandName: 'Genfeed',
      }),
    ).toEqual(['Write as Genfeed.']);
  });

  it('falls back to "your brand" without a label', () => {
    expect(
      personalizeBrandInterviewExamples(['Hello Acme'], { brandName: '  ' }),
    ).toEqual(['Hello your brand']);
  });
});
