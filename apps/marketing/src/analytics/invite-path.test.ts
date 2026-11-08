import { describe, expect, it } from 'vitest';
import { hasInvitePath } from './invite-path';

describe('hasInvitePath', () => {
  it.each([
    ['/u/acme/invite/abc123', true],
    ['https://genfeed.ai/u/acme/invite/abc123?x=1', true],
    ['https%3A%2F%2Fgenfeed.ai%2Fu%2Facme%2Finvite%2Fabc123', true],
    ['/u/acme', false],
    ['/u/acme/articles/invite-your-team', false],
    ['/articles/how-to-invite', false],
  ])('%s → %s', (value, expected) => {
    expect(hasInvitePath(value)).toBe(expected);
  });
});
