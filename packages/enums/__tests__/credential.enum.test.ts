import { describe, expect, it } from 'vitest';
import { CredentialPlatform } from '../src/credential.enum';

describe('credential.enum', () => {
  describe('CredentialPlatform (aliased export)', () => {
    it('should be defined and have enum values', () => {
      expect(CredentialPlatform).toBeDefined();
      expect(Object.keys(CredentialPlatform).length).toBeGreaterThan(0);
    });
  });
});
