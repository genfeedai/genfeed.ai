import type { IUser } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { getUserDisplayName, getUserInitial } from './user-display.helpers';

const user = (overrides: Partial<IUser>): IUser =>
  ({ email: 'jane@example.com', ...overrides }) as IUser;

describe('user display helpers', () => {
  it('prefers the account name, then first and last name', () => {
    expect(getUserDisplayName(user({ name: ' Jane D ' }))).toBe('Jane D');
    expect(
      getUserDisplayName(user({ firstName: 'Jane', lastName: 'Doe' })),
    ).toBe('Jane Doe');
  });

  it('returns undefined when no name was captured', () => {
    expect(getUserDisplayName(user({ firstName: '', name: null }))).toBe(
      undefined,
    );
  });

  it('builds the avatar initial from the name, else the email', () => {
    expect(getUserInitial(user({ name: 'jane' }))).toBe('J');
    expect(getUserInitial(user({ email: 'bob@example.com' }))).toBe('B');
    expect(getUserInitial(user({ email: '' }))).toBe('?');
  });
});
