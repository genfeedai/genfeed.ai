import { describe, expect, it } from 'vitest';

import { isBotOpenToAllUsers, isBotUserAuthorized } from './bot-authorization';

describe('isBotUserAuthorized', () => {
  it('denies every user when the allowlist is empty and no opt-out is set', () => {
    expect(isBotUserAuthorized({ allowedUserIds: [] }, 'U123')).toBe(false);
  });

  it('denies every user when the allowlist is absent', () => {
    expect(isBotUserAuthorized({}, 'U123')).toBe(false);
  });

  it('denies every user when isOpenToAllUsers is explicitly false', () => {
    expect(
      isBotUserAuthorized(
        { allowedUserIds: [], isOpenToAllUsers: false },
        'U1',
      ),
    ).toBe(false);
  });

  it('allows any user only when isOpenToAllUsers is explicitly true', () => {
    expect(
      isBotUserAuthorized(
        { allowedUserIds: [], isOpenToAllUsers: true },
        'anyone',
      ),
    ).toBe(true);
  });

  it('allows a user on the allowlist', () => {
    expect(
      isBotUserAuthorized({ allowedUserIds: ['U123', 'U456'] }, 'U456'),
    ).toBe(true);
  });

  it('denies a user absent from a populated allowlist', () => {
    expect(isBotUserAuthorized({ allowedUserIds: ['U123'] }, 'U999')).toBe(
      false,
    );
  });

  it('lets a populated allowlist override isOpenToAllUsers', () => {
    const config = { allowedUserIds: ['U123'], isOpenToAllUsers: true };

    expect(isBotUserAuthorized(config, 'U123')).toBe(true);
    expect(isBotUserAuthorized(config, 'U999')).toBe(false);
  });

  it('denies a missing user id even on an open bot', () => {
    const openConfig = { allowedUserIds: [], isOpenToAllUsers: true };

    expect(isBotUserAuthorized(openConfig, undefined)).toBe(false);
    expect(isBotUserAuthorized(openConfig, null)).toBe(false);
    expect(isBotUserAuthorized(openConfig, '')).toBe(false);
  });

  it('denies a whitespace-only user id even on an open bot', () => {
    const openConfig = { allowedUserIds: [], isOpenToAllUsers: true };

    expect(isBotUserAuthorized(openConfig, '   ')).toBe(false);
    expect(isBotUserAuthorized(openConfig, '\t')).toBe(false);
    expect(isBotUserAuthorized(openConfig, '\n')).toBe(false);
  });

  it('matches an allowlisted id despite surrounding whitespace', () => {
    const config = { allowedUserIds: ['123'], isOpenToAllUsers: false };

    expect(isBotUserAuthorized(config, ' 123 ')).toBe(true);
    expect(isBotUserAuthorized(config, '  ')).toBe(false);
  });

  it('does not treat a truthy non-boolean opt-out as an opt-out', () => {
    const config = {
      allowedUserIds: [],
      isOpenToAllUsers: 'true',
    } as unknown as Parameters<typeof isBotUserAuthorized>[0];

    expect(isBotUserAuthorized(config, 'U123')).toBe(false);
  });
});

describe('isBotOpenToAllUsers', () => {
  it('reports false for an unconfigured allowlist', () => {
    expect(isBotOpenToAllUsers({ allowedUserIds: [] })).toBe(false);
  });

  it('reports true only for the explicit flag', () => {
    expect(isBotOpenToAllUsers({ isOpenToAllUsers: true })).toBe(true);
    expect(isBotOpenToAllUsers({ isOpenToAllUsers: false })).toBe(false);
  });

  it('reports false when a populated allowlist still narrows access', () => {
    expect(
      isBotOpenToAllUsers({
        allowedUserIds: ['U123'],
        isOpenToAllUsers: true,
      }),
    ).toBe(false);
  });
});
