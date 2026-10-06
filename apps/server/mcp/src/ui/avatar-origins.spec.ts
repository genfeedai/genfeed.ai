import { isAccountAvatarOrigin } from '@mcp/ui/avatar-origins';

describe('account avatar origins', () => {
  it.each([
    'https://pbs.twimg.com/profile.jpg',
    'https://media.licdn.com/profile.jpg',
    'https://scontent.fmla1.fbcdn.net/avatar.jpg',
    'https://p16.tiktokcdn.com/avatar.jpg',
  ])('allows public social profile images: %s', (url) => {
    expect(isAccountAvatarOrigin(new URL(url))).toBe(true);
  });
  it.each([
    'https://pbs.twimg.com.evil.example/a.png',
    'https://licdn.com.evil.example/a.png',
    'http://media.licdn.com/a.png',
    'https://media.licdn.com:8443/a.png',
    'https://untrusted.example/a.png',
  ])('rejects unrelated hosts and transport variants: %s', (url) => {
    expect(isAccountAvatarOrigin(new URL(url))).toBe(false);
  });
});
