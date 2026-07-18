import { describe, expect, it } from 'bun:test';
import type {
  IDesktopSession,
  IDesktopSyncConsent,
} from '@genfeedai/desktop-contracts';
import type { DesktopKvService } from './kv.service';
import {
  assertActiveSyncAccount,
  DesktopSyncConsentService,
  getAccountScopedSyncCursorKey,
} from './sync-consent.service';

const session = (userId: string): IDesktopSession => ({
  issuedAt: '2026-07-18T08:00:00.000Z',
  token: `token-${userId}`,
  userId,
});

const createKvMock = () => {
  const values = new Map<string, string>();

  return {
    getValueSync: (key: string) => values.get(key) ?? null,
    setValue: async (key: string, value: string) => {
      values.set(key, value);
    },
    values,
  } as unknown as DesktopKvService & { values: Map<string, string> };
};

describe('DesktopSyncConsentService', () => {
  it('requires a new explicit decision for each cloud account', async () => {
    const service = new DesktopSyncConsentService(createKvMock());

    expect(service.getConsent(session('cloud-user-1'))).toMatchObject({
      cloudUserId: 'cloud-user-1',
      status: 'pending',
    });

    await service.setConsent(session('cloud-user-1'), {
      hasFullAssetUploadConsent: false,
      status: 'granted',
    });

    expect(service.getConsent(session('cloud-user-1'))).toMatchObject({
      hasFullAssetUploadConsent: false,
      cloudUserId: 'cloud-user-1',
      status: 'granted',
    });
    expect(service.getConsent(session('cloud-user-2'))).toMatchObject({
      cloudUserId: 'cloud-user-2',
      status: 'pending',
    });
  });

  it('never retains full-asset permission when sync is declined', async () => {
    const service = new DesktopSyncConsentService(createKvMock());

    const consent = await service.setConsent(session('cloud-user-1'), {
      hasFullAssetUploadConsent: true,
      status: 'declined',
    });

    expect(consent).toMatchObject({
      hasFullAssetUploadConsent: false,
      status: 'declined',
    } satisfies Partial<IDesktopSyncConsent>);
  });

  it('does not require sync consent without a cloud session', () => {
    const service = new DesktopSyncConsentService(createKvMock());

    expect(service.getConsent(null)).toEqual({
      hasFullAssetUploadConsent: false,
      status: 'not-required',
    });
  });

  it('isolates sync cursors by cloud account and data scope', () => {
    expect(getAccountScopedSyncCursorKey('cloud-user-1')).toBe(
      'sync.threads.cloud-user-1.cursor',
    );
    expect(getAccountScopedSyncCursorKey('cloud-user-2', 'brandManifest')).toBe(
      'sync.brandManifest.cloud-user-2.cursor',
    );
  });

  it('rejects stale sync work after the active account changes', () => {
    expect(
      assertActiveSyncAccount(session('cloud-user-1'), 'cloud-user-1'),
    ).toMatchObject({ userId: 'cloud-user-1' });
    expect(() =>
      assertActiveSyncAccount(session('cloud-user-2'), 'cloud-user-1'),
    ).toThrow('active Genfeed Cloud account changed');
    expect(() => assertActiveSyncAccount(null, 'cloud-user-1')).toThrow(
      'active Genfeed Cloud account changed',
    );
  });

  it('requires a new decision when stored consent is corrupt or mismatched', () => {
    const database = createKvMock();
    const service = new DesktopSyncConsentService(database);

    database.values.set('desktop.sync.consent.cloud-user-1', '{broken-json');
    expect(service.getConsent(session('cloud-user-1'))).toMatchObject({
      cloudUserId: 'cloud-user-1',
      status: 'pending',
    });

    database.values.set(
      'desktop.sync.consent.cloud-user-1',
      JSON.stringify({
        cloudUserId: 'cloud-user-2',
        hasFullAssetUploadConsent: true,
        status: 'granted',
      }),
    );
    expect(service.getConsent(session('cloud-user-1'))).toMatchObject({
      cloudUserId: 'cloud-user-1',
      status: 'pending',
    });
  });

  it('strips full-asset permission from a rehydrated declined decision', () => {
    const database = createKvMock();
    const service = new DesktopSyncConsentService(database);

    database.values.set(
      'desktop.sync.consent.cloud-user-1',
      JSON.stringify({
        cloudUserId: 'cloud-user-1',
        hasFullAssetUploadConsent: true,
        status: 'declined',
      }),
    );

    expect(service.getConsent(session('cloud-user-1'))).toMatchObject({
      hasFullAssetUploadConsent: false,
      status: 'declined',
    });
  });
});
