import { CredentialPlatform } from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  parseCreatePostingSetInput,
  parseStoredPlatforms,
  parseStoredPostingSetTargets,
  referencedCredentialIds,
  toCredentialRefs,
} from './posting-set-persistence.helpers';

describe('posting-set persistence helpers', () => {
  it('parses contract-backed create payloads', () => {
    const parsed = parseCreatePostingSetInput({
      label: 'Launch channels',
      targets: [
        {
          credentialId: 'cred_x',
          platform: CredentialPlatform.TWITTER,
          signatureIds: ['sig-twitter'],
          targetKey: 'x-primary',
        },
      ],
    });

    expect(parsed.label).toBe('Launch channels');
    expect(parsed.targets).toHaveLength(1);
  });

  it('rejects a posting set without targets', () => {
    let thrown: unknown;

    try {
      parseCreatePostingSetInput({
        label: 'Empty',
        targets: [],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as BadRequestException).getResponse()).toMatchObject({
      title: 'Invalid posting set payload',
    });
  });

  it('drops malformed stored targets instead of throwing', () => {
    expect(parseStoredPostingSetTargets({ not: 'an-array' })).toEqual([]);
    expect(
      parseStoredPostingSetTargets([
        {
          credentialId: 'cred_x',
          platform: CredentialPlatform.TWITTER,
          targetKey: 'x-primary',
        },
      ]),
    ).toHaveLength(1);
  });

  it('maps prisma credential platforms without leaking secrets', () => {
    const refs = toCredentialRefs([
      {
        id: 'cred_x',
        isConnected: true,
        isDeleted: false,
        platform: 'TWITTER',
      },
    ]);

    expect(refs).toEqual([
      {
        id: 'cred_x',
        isConnected: true,
        isDeleted: false,
        platform: CredentialPlatform.TWITTER,
      },
    ]);
    expect(JSON.stringify(refs)).not.toMatch(/oauth|token|secret/i);
  });

  it('collects unique credential ids', () => {
    expect(
      referencedCredentialIds([
        {
          credentialId: 'cred_x',
          platform: CredentialPlatform.TWITTER,
          targetKey: 'x-primary',
        },
        {
          credentialId: 'cred_x',
          platform: CredentialPlatform.TWITTER,
          targetKey: 'x-secondary',
        },
      ]),
    ).toEqual(['cred_x']);
  });

  it('keeps only domain platforms from stored signature rows', () => {
    expect(
      parseStoredPlatforms(['twitter', 'TWITTER', 'not-a-platform']),
    ).toEqual([CredentialPlatform.TWITTER]);
  });
});
