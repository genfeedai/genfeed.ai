import { omitMentionedText } from '@api/services/generation-brief/omit-mentioned-text.util';

describe('omitMentionedText', () => {
  it('keeps only the values the objective does not mention, ignoring case', () => {
    expect(
      omitMentionedText('A Courier walking home', [
        'a courier',
        'in the rain',
        undefined,
        '  ',
      ]),
    ).toEqual(['in the rain']);
  });

  it('trims what it keeps', () => {
    expect(omitMentionedText('harbor', ['  a ship '])).toEqual(['a ship']);
  });
});
