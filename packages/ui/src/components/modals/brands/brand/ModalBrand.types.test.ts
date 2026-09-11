import { CredentialPlatform } from '@genfeedai/contracts';
import type { ICredential } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  buildSocialConnections,
  isVisibleCredentialRow,
} from './ModalBrand.types';

function buildCredential(overrides: Partial<ICredential> = {}): ICredential {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'cred-1',
    isConnected: true,
    isDeleted: false,
    platform: CredentialPlatform.TWITTER,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as ICredential;
}

describe('isVisibleCredentialRow', () => {
  it('shows a connected credential with a captured identity', () => {
    expect(
      isVisibleCredentialRow(
        buildCredential({ externalId: 'ext-1', isConnected: true }),
      ),
    ).toBe(true);
  });

  it('shows a connected credential missing its identity (legacy broken row)', () => {
    expect(
      isVisibleCredentialRow(
        buildCredential({ externalId: undefined, isConnected: true }),
      ),
    ).toBe(true);
  });

  it('shows a disconnected credential that still has an identity (lapsed connection)', () => {
    expect(
      isVisibleCredentialRow(
        buildCredential({ externalId: 'ext-1', isConnected: false }),
      ),
    ).toBe(true);
  });

  it('hides a disconnected credential with no identity (pending or abandoned OAuth)', () => {
    expect(
      isVisibleCredentialRow(
        buildCredential({ externalId: undefined, isConnected: false }),
      ),
    ).toBe(false);
  });

  it('always hides a deleted credential regardless of connection state', () => {
    expect(
      isVisibleCredentialRow(
        buildCredential({
          externalId: 'ext-1',
          isConnected: true,
          isDeleted: true,
        }),
      ),
    ).toBe(false);
  });
});

describe('buildSocialConnections', () => {
  it('returns an empty list for a null brand', () => {
    expect(buildSocialConnections(null)).toEqual([]);
  });

  it('drops a deleted credential and a connectionless, identity-less one', () => {
    const connections = buildSocialConnections({
      credentials: [
        buildCredential({ externalId: 'ext-1', id: 'cred-live' }),
        buildCredential({ id: 'cred-deleted', isDeleted: true }),
        buildCredential({
          externalId: undefined,
          id: 'cred-orphan',
          isConnected: false,
        }),
      ],
    });

    expect(connections.map((connection) => connection.credentialId)).toEqual([
      'cred-live',
    ]);
  });

  it('keeps a lapsed connection and carries isConnected/externalId/accessTokenExpiry through', () => {
    const connections = buildSocialConnections({
      credentials: [
        buildCredential({
          accessTokenExpiry: '2020-01-01T00:00:00.000Z',
          externalId: 'ext-2',
          id: 'cred-lapsed',
          isConnected: false,
        }),
      ],
    });

    expect(connections).toHaveLength(1);
    expect(connections[0]).toEqual(
      expect.objectContaining({
        accessTokenExpiry: '2020-01-01T00:00:00.000Z',
        credentialId: 'cred-lapsed',
        externalId: 'ext-2',
        isConnected: false,
      }),
    );
  });

  it('renders a handle-less connection without a fallback handle', () => {
    const connections = buildSocialConnections({
      credentials: [
        buildCredential({
          externalHandle: null,
          externalId: 'ext-3',
          externalName: 'Acme Facebook Page',
          id: 'cred-no-handle',
          platform: CredentialPlatform.FACEBOOK,
        }),
      ],
    });

    expect(connections).toHaveLength(1);
    expect(connections[0]?.handle).toBeFalsy();
    expect(connections[0]?.name).toBe('Acme Facebook Page');
  });
});
