import type { ICredential } from '@genfeedai/interfaces';

export interface PlatformSelectorProps {
  credentials: ICredential[];
  selectedCredentialId: string;
  onSelect: (credentialId: string) => void;
  isDisabled?: boolean;
  className?: string;
}
