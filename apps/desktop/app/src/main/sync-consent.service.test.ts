import { describe, expect, it } from 'bun:test';
import type {
  IDesktopSession,
  IDesktopSyncConsent,
} from '@genfeedai/desktop-contracts';
import type { DesktopKvService } from './kv.service';
import {
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
      allowFullAssetUploads: false,
      status: 'granted',
    });

    expect(service.getConsent(session('cloud-user-1'))).toMatchObject({
      allowFullAssetUploads: false,
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
      allowFullAssetUploads: true,
      status: 'declined',
    });

    expect(consent).toMatchObject({
      allowFullAssetUploads: false,
      status: 'declined',
    } satisfies Partial<IDesktopSyncConsent>);
  });

  it('does not require sync consent without a cloud session', () => {
    const service = new DesktopSyncConsentService(createKvMock());

    expect(service.getConsent(null)).toEqual({
      allowFullAssetUploads: false,
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
});
