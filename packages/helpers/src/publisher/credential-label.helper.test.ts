import { CredentialPlatform } from '@genfeedai/contracts';
import {
  type CredentialLabelSource,
  getCredentialLabel,
} from '@helpers/publisher/credential-label.helper';
import { describe, expect, it } from 'vitest';

const platform = CredentialPlatform.INSTAGRAM;

describe('getCredentialLabel', () => {
  it.each<[CredentialLabelSource, string]>([
    [
      { externalHandle: '@h', externalName: 'Name', label: 'Label', platform },
      'Label',
    ],
    [
      { externalHandle: '@h', externalName: 'Name', label: null, platform },
      'Name',
    ],
    [{ externalHandle: '@h', platform }, '@h'],
    [{ externalHandle: 'h', platform }, '@h'],
    [{ platform }, platform],
  ])('labels %j as %s', (credential, expected) => {
    expect(getCredentialLabel(credential)).toBe(expected);
  });
});
