import { describe, expect, it } from 'bun:test';
import { toExternalHttpUrl } from './external-url.util';

describe('toExternalHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(toExternalHttpUrl('https://genfeed.ai/a?b=1')).toBe(
      'https://genfeed.ai/a?b=1',
    );
    expect(toExternalHttpUrl('http://localhost:3000')).toBe(
      'http://localhost:3000/',
    );
  });

  it('rejects schemes that run commands or open files', () => {
    expect(
      toExternalHttpUrl('command:workbench.action.reloadWindow'),
    ).toBeNull();
    expect(toExternalHttpUrl('file:///etc/passwd')).toBeNull();
    expect(toExternalHttpUrl('vscode://publisher.ext/path')).toBeNull();
    expect(toExternalHttpUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects non-URLs and non-strings', () => {
    expect(toExternalHttpUrl('not a url')).toBeNull();
    expect(toExternalHttpUrl(undefined)).toBeNull();
    expect(toExternalHttpUrl({ href: 'https://genfeed.ai' })).toBeNull();
  });
});
