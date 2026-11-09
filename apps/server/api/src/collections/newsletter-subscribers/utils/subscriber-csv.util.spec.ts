import {
  parseCsv,
  parseEmailList,
  parseSubscriberCsv,
  toCsv,
} from '@api/collections/newsletter-subscribers/utils/subscriber-csv.util';
import { describe, expect, it } from 'vitest';

describe('subscriber CSV', () => {
  it('parses quoted cells, escaped quotes and CRLF line ends', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });

  it('maps a file with a header to rows, invalid rows kept by line number', () => {
    expect(
      parseSubscriberCsv(
        'Name,E-mail,Tags\nAda,ADA@Example.com,"vip; early"\nBob,not-an-email,\n',
      ),
    ).toEqual({
      invalid: [{ row: 3, value: 'not-an-email' }],
      rows: [
        {
          email: 'ada@example.com',
          name: 'Ada',
          row: 2,
          tags: ['vip', 'early'],
        },
      ],
    });
  });

  it('finds the address column in a file without a header', () => {
    expect(parseSubscriberCsv('Ada,ada@example.com\n').rows).toEqual([
      { email: 'ada@example.com', name: null, row: 1, tags: [] },
    ]);
  });

  it('splits pasted addresses on lines, commas and spaces', () => {
    expect(parseEmailList(['a@example.com, b@example.com\nnope'])).toEqual({
      invalid: [{ row: 3, value: 'nope' }],
      rows: [
        { email: 'a@example.com', name: null, row: 1, tags: [] },
        { email: 'b@example.com', name: null, row: 2, tags: [] },
      ],
    });
  });

  it('neutralises spreadsheet formulas in an export', () => {
    expect(
      toCsv(['email', 'name'], [['a@example.com', '=HYPERLINK("x")']]),
    ).toBe('email,name\na@example.com,"\'=HYPERLINK(""x"")"');
  });
});
