import { describe, expect, it } from 'vitest';
import { pseudoLocalizeMessage } from './pseudo';

describe('pseudoLocalizeMessage', () => {
  it('leaves rich-text tag names untouched but accents their content', () => {
    const pseudo = pseudoLocalizeMessage('Read the <b>docs</b>');

    expect(pseudo).toContain('<b>');
    expect(pseudo).toContain('</b>');
    expect(pseudo).toContain('ðöçš');
  });
});
