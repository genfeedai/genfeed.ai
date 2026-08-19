import { CredentialPlatform } from '@genfeedai/enums';
import { CredentialSerializer } from '@serializers/server/organizations/credential.serializer';
import { describe, expect, it } from 'vitest';

describe('CredentialSerializer', () => {
  it('emits domain lowercase platform for a Prisma SCREAMING row', () => {
    const output = CredentialSerializer.serialize({
      id: 'cred-1',
      isDeleted: false,
      label: 'Launch account',
      platform: 'TWITTER',
    }) as {
      data: { attributes: { platform?: string }; id: string; type: string };
    };

    expect(output.data.type).toBe('credential');
    expect(output.data.id).toBe('cred-1');
    expect(output.data.attributes.platform).toBe(CredentialPlatform.TWITTER);
    expect(output.data.attributes.platform).toBe('twitter');
  });

  it('maps a collection of Prisma-shaped credentials', () => {
    const output = CredentialSerializer.serialize([
      { id: 'cred-1', platform: 'INSTAGRAM' },
      { id: 'cred-2', platform: 'DEVTO' },
    ]) as {
      data: Array<{ attributes: { platform?: string } }>;
    };

    expect(output.data[0]?.attributes.platform).toBe(
      CredentialPlatform.INSTAGRAM,
    );
    expect(output.data[1]?.attributes.platform).toBe(CredentialPlatform.DEV_TO);
  });
});
