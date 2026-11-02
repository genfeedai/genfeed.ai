import { describe, expect, it } from 'vitest';
import { getProposedValueView } from './proposed-value';

describe('getProposedValueView', () => {
  it.each([
    ['a string', 'Acme Growth', { kind: 'text', text: 'Acme Growth' }],
    [
      'a logo record, shown as an image with its label',
      { label: 'Acme logo', role: 'logo', url: 'https://cdn.test/acme.png' },
      {
        kind: 'image',
        label: 'Acme logo',
        url: 'https://cdn.test/acme.png',
      },
    ],
    [
      'a logo record without a label, labelled by its url',
      { url: 'https://cdn.test/acme.png' },
      {
        kind: 'image',
        label: 'https://cdn.test/acme.png',
        url: 'https://cdn.test/acme.png',
      },
    ],
    [
      'a list of strings, joined',
      ['friendly', 'direct'],
      { kind: 'text', text: 'friendly, direct' },
    ],
    [
      'any other record, as text',
      { tone: 'direct' },
      { kind: 'text', text: '{"tone":"direct"}' },
    ],
  ])('reads %s', (_name, value, expected) => {
    expect(getProposedValueView(value)).toEqual(expected);
  });
});
