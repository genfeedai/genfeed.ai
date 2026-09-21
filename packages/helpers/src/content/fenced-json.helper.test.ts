import { describe, expect, it } from 'vitest';

import { unwrapFencedJson } from './fenced-json.helper';

const body = '{"a":1}';

describe('unwrapFencedJson', () => {
  it('returns unfenced text unchanged', () => {
    expect(unwrapFencedJson(body)).toBe(body);
    expect(unwrapFencedJson(`  ${body}  `)).toBe(body);
  });

  it.each([
    ['json fence', '```json\n{BODY}\n```'],
    ['bare fence', '```\n{BODY}\n```'],
    ['uppercase info string', '```JSON\n{BODY}\n```'],
    ['other info string', '```jsonc\n{BODY}\n```'],
    ['four backticks', '````json\n{BODY}\n````'],
    ['tilde fence', '~~~json\n{BODY}\n~~~'],
    ['four tildes', '~~~~\n{BODY}\n~~~~'],
    ['body on the marker line', '```json {BODY}\n```'],
    ['no trailing newline', '```json\n{BODY}```'],
    ['prose around the fence', 'Here you go:\n```json\n{BODY}\n```\nEnjoy!'],
    ['indented fence', '  ```json\n{BODY}\n  ```'],
    ['crlf line endings', '```json\r\n{BODY}\r\n```'],
    ['close longer than the open', '```json\n{BODY}\n````'],
    ['tilde close longer than the open', '~~~json\n{BODY}\n~~~~~'],
  ])('unwraps a %s', (_name, template) => {
    expect(unwrapFencedJson(template.replace('{BODY}', body))).toBe(body);
  });

  it('keeps a longer fence that only looks closed by a shorter one', () => {
    const nested = '````\n```\n{"a":1}\n```\n````';

    expect(unwrapFencedJson(nested)).toBe('```\n{"a":1}\n```');
  });

  it('does not let one fence character close the other', () => {
    const mismatched = '```json\n{"a":1}\n~~~';

    expect(unwrapFencedJson(mismatched)).toBe(mismatched);
  });

  it('leaves text alone when the fence is never closed', () => {
    const unclosed = `\`\`\`json\n${body}`;

    expect(unwrapFencedJson(unclosed)).toBe(unclosed);
  });
});
