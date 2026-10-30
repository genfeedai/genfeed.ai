import path from 'node:path';
import { resolveFontFile } from '@files/helpers/utils/font/font-file.util';
import { readFontDisplayName } from '@files/helpers/utils/font/font-name.util';

describe('readFontDisplayName', () => {
  it('joins the family and style of a static TTF', () => {
    expect(readFontDisplayName(resolveFontFile('INTER_BOLD'))).toBe(
      'Inter Bold',
    );
    expect(readFontDisplayName(resolveFontFile('MONTSERRAT_BLACK'))).toBe(
      'Montserrat Black',
    );
  });

  it('leaves a regular style off the name', () => {
    expect(readFontDisplayName(resolveFontFile('ANTON'))).toBe('Anton');
  });

  it('returns null for a file that is not a font', () => {
    expect(readFontDisplayName(path.resolve(__filename))).toBeNull();
    expect(readFontDisplayName('/nonexistent/font.ttf')).toBeNull();
  });
});
