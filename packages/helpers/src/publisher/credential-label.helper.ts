import type { ICredential } from '@genfeedai/contracts/interfaces';

export type CredentialLabelSource = Pick<
  ICredential,
  'externalHandle' | 'externalName' | 'label' | 'platform'
>;

/** Display label for a connected account: label, else name, else @handle, else platform. */
export function getCredentialLabel(credential: CredentialLabelSource): string {
  const handle = credential.externalHandle?.replace(/^@/, '');

  return (
    credential.label ??
    credential.externalName ??
    (handle ? `@${handle}` : credential.platform)
  );
}
