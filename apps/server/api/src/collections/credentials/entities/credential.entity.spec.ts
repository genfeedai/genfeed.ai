import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';

describe('CredentialEntity', () => {
  it('should be defined', () => {
    expect(new CredentialEntity({})).toBeDefined();
  });
});
