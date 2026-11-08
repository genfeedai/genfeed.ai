import { describe, expect, it } from 'vitest';
import { hasInvitePath } from './invite-path';

describe('hasInvitePath', () => {
  it.each([
    ['/@acme/invite/abc123', true],
    ['https://genfeed.ai/@acme/invite/abc123?x=1', true],
    ['https%3A%2F%2Fgenfeed.ai%2F%40acme%2Finvite%2Fabc123', true],
    ['/creator-profile/acme/invite/abc123', true],
    ['/@acme', false],
    ['/@acme/articles/invite-your-team', false],
    ['/@acme/articles/invite', false],
    ['/articles/how-to-invite', false],
  ])('%s → %s', (value, expected) => {
    expect(hasInvitePath(value)).toBe(expected);
  });
});
