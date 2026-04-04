import type { ICredential } from '@cloud/interfaces';

export interface PlatformSelectorProps {
  credentials: ICredential[];
  selectedCredentialId: string;
  onSelect: (credentialId: string) => void;
  isDisabled?: boolean;
  className?: string;
}
