// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BootRecordGuard from '@/components/providers/boot-record/BootRecordGuard';
import {
  readBootRecordUserId,
  writeBootRecord,
} from '@/lib/boot-record/boot-record';
import { createBootRecord } from '@/lib/boot-record/boot-record.fixture';

const state = vi.hoisted(() => ({
  identity: {
    isLoaded: true,
    isSignedIn: true,
    userId: 'user-1' as string | null,
  },
  status: 'matched',
}));
const clearQueryCache = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock(
  '@genfeedai/contexts/user/organization-context/organization-context',
  () => ({ useRoutedOrganization: () => ({ status: state.status }) }),
);
vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => state.identity,
}));
vi.mock('@genfeedai/helpers/auth/auth.helper', () => ({
  getPlaywrightAuthState: () => null,
}));
vi.mock('@/lib/query-cache/persisted-query-cache', () => ({
  clearPersistedQueryCache: clearQueryCache,
}));

function store(userId: string): void {
  writeBootRecord(createBootRecord({ userId }));
}

describe('BootRecordGuard', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearQueryCache.mockClear();
    state.identity = { isLoaded: true, isSignedIn: true, userId: 'user-1' };
    state.status = 'matched';
    store('user-1');
  });

  it('keeps the record while the organization is confirmed for its user', () => {
    render(<BootRecordGuard />);

    expect(readBootRecordUserId()).toBe('user-1');
    expect(clearQueryCache).not.toHaveBeenCalled();
  });

  it('keeps the record while the check is still running or has failed to answer', () => {
    for (const status of ['loading', 'switching', 'failed']) {
      state.status = status;
      render(<BootRecordGuard />);
    }

    expect(readBootRecordUserId()).toBe('user-1');
    expect(clearQueryCache).not.toHaveBeenCalled();
  });

  it('wipes the record and the device query cache when the organization is refused', () => {
    state.status = 'unauthorized';
    render(<BootRecordGuard />);

    expect(readBootRecordUserId()).toBeNull();
    expect(clearQueryCache).toHaveBeenCalledTimes(1);
  });

  it('wipes them when the session has ended', () => {
    state.identity = { isLoaded: true, isSignedIn: false, userId: null };
    render(<BootRecordGuard />);

    expect(readBootRecordUserId()).toBeNull();
    expect(clearQueryCache).toHaveBeenCalledTimes(1);
  });

  it("wipes them when the session is another user's", () => {
    state.identity = { isLoaded: true, isSignedIn: true, userId: 'user-2' };
    render(<BootRecordGuard />);

    expect(readBootRecordUserId()).toBeNull();
    expect(clearQueryCache).toHaveBeenCalledTimes(1);
  });
});
