import { describe, expect, it } from 'vitest';
import { pseudoLocalizeMessage, pseudoLocalizeMessages } from './pseudo';

describe('pseudoLocalizeMessage', () => {
  it('brackets the message so untranslated copy is visible on screen', () => {
    const pseudo = pseudoLocalizeMessage('Save');

    expect(pseudo.startsWith('[!!')).toBe(true);
    expect(pseudo.endsWith('!!]')).toBe(true);
  });

  it('accents the letters it has a mapping for', () => {
    expect(pseudoLocalizeMessage('Save')).toContain('Šávé');
  });

  it('pads to about 30% longer so tight layouts break in development', () => {
    const message = 'Delete this asset';
    const pseudo = pseudoLocalizeMessage(message);
    const padding = pseudo.match(/·+/)?.[0] ?? '';

    expect(padding.length).toBe(Math.ceil(message.length * 0.3));
  });

  it('leaves simple placeholders untouched', () => {
    expect(pseudoLocalizeMessage('Hello {name}')).toContain('{name}');
  });

  it('leaves whole ICU constructs untouched', () => {
    const message = '{count, plural, one {# asset} other {# assets}}';

    expect(pseudoLocalizeMessage(message)).toBe(
      `[!!${message}${'·'.repeat(Math.ceil(message.length * 0.3))}!!]`,
    );
  });

  it('leaves rich-text tag names untouched but accents their content', () => {
    const pseudo = pseudoLocalizeMessage('Read the <b>docs</b>');

    expect(pseudo).toContain('<b>');
    expect(pseudo).toContain('</b>');
    expect(pseudo).toContain('ðöçš');
  });

  it('recovers from an unbalanced closing brace instead of going verbatim', () => {
    // A stray `}` must not drive the depth counter negative — everything after
    // it would then be treated as placeholder content and silently skipped.
    expect(pseudoLocalizeMessage('} save')).toContain('šávé');
  });
});

describe('pseudoLocalizeMessages', () => {
  it('walks nested namespaces and localizes every leaf', () => {
    const pseudo = pseudoLocalizeMessages({
      common: {
        actions: { save: 'Save' },
      },
    });

    expect(pseudo.common.actions.save).toBe(pseudoLocalizeMessage('Save'));
  });

  it('preserves the key structure of the source catalog', () => {
    const pseudo = pseudoLocalizeMessages({
      common: { empty: { default: 'Nothing here yet' } },
    });

    expect(Object.keys(pseudo)).toEqual(['common']);
    expect(Object.keys(pseudo.common)).toEqual(['empty']);
  });
});
