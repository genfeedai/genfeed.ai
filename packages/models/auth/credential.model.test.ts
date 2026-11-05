import { CredentialPlatform } from '@genfeedai/contracts';
import type { ICredential } from '@genfeedai/contracts/interfaces';
import {
  createBaseEntity,
  createOrganization,
  createUser,
} from '@genfeedai/helpers/testing/entity-fixtures';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  BaseCredential: class BaseCredential {
    public platform!: string;
    public externalHandle?: string;
    public user?: unknown;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
  BaseCredentialInstagram: class BaseCredentialInstagram {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
  BaseCredentialOAuth: class BaseCredentialOAuth {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/auth/user.model', () => ({
  User: class User {
    public id?: string;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import {
  Credential,
  CredentialInstagram,
  CredentialOAuth,
} from '@models/auth/credential.model';

const createCredential = (partial: Partial<ICredential> = {}) =>
  new Credential({
    ...createBaseEntity<ICredential>(partial),
    brandId: 'brand-123',
    externalHandle: 'user123',
    externalId: 'external-123',
    isConnected: true,
    organization: createOrganization(),
    organizationId: 'organization-123',
    platform: CredentialPlatform.TWITTER,
    user: createUser(),
    userId: 'user-123',
    ...partial,
  });

describe('Credential', () => {
  describe('constructor', () => {
    it('should create a credential instance', () => {
      const cred = createCredential({
        externalHandle: 'user123',
        platform: CredentialPlatform.TWITTER,
      });
      expect(cred.platform).toBe(CredentialPlatform.TWITTER);
      expect(cred.externalHandle).toBe('user123');
    });

    it('should instantiate populated user', () => {
      const cred = createCredential({
        user: createUser({ id: 'user-123' }),
      });
      expect(cred.user).toBeDefined();
      expect((cred.user as { id: string }).id).toBe('user-123');
    });

    it('keeps the canonical user ID independently of population', () => {
      const cred = createCredential({ userId: 'user-string-id' });
      expect(cred.userId).toBe('user-string-id');
    });
  });

  describe('externalUrl', () => {
    it('should return YouTube URL', () => {
      const cred = createCredential({
        externalHandle: 'channel123',
        platform: CredentialPlatform.YOUTUBE,
      });
      expect(cred.externalUrl).toBe('https://www.youtube.com/@channel123');
    });

    it('should return TikTok URL', () => {
      const cred = createCredential({
        externalHandle: 'tiktoker',
        platform: CredentialPlatform.TIKTOK,
      });
      expect(cred.externalUrl).toBe('https://www.tiktok.com/@tiktoker');
    });

    it('should return Twitter/X URL', () => {
      const cred = createCredential({
        externalHandle: 'tweeter',
        platform: CredentialPlatform.TWITTER,
      });
      expect(cred.externalUrl).toBe('https://x.com/tweeter');
    });

    it('normalizes a leading at-sign in provider handles', () => {
      const cred = createCredential({
        externalHandle: '@tweeter',
        platform: CredentialPlatform.TWITTER,
      });
      expect(cred.externalUrl).toBe('https://x.com/tweeter');
    });

    it('returns an empty URL when the credential has no external handle', () => {
      const cred = createCredential({
        externalHandle: null,
        platform: CredentialPlatform.TWITTER,
      });
      expect(cred.externalUrl).toBe('');
    });

    it('should return Instagram URL', () => {
      const cred = createCredential({
        externalHandle: 'instagrammer',
        platform: CredentialPlatform.INSTAGRAM,
      });
      expect(cred.externalUrl).toBe('https://www.instagram.com/instagrammer');
    });

    it('should return LinkedIn URL', () => {
      const cred = createCredential({
        externalHandle: 'professional',
        platform: CredentialPlatform.LINKEDIN,
      });
      expect(cred.externalUrl).toBe('https://www.linkedin.com/in/professional');
    });

    it('should return empty string for unknown platform', () => {
      const cred = createCredential({
        externalHandle: 'handle',
        platform: 'UNKNOWN' as CredentialPlatform,
      });
      expect(cred.externalUrl).toBe('');
    });
  });
});

describe('CredentialInstagram', () => {
  it('should create an instance', () => {
    const inst = new CredentialInstagram({});
    expect(inst).toBeDefined();
  });
});

describe('CredentialOAuth', () => {
  it('should create an instance', () => {
    const oauth = new CredentialOAuth({});
    expect(oauth).toBeDefined();
  });
});
