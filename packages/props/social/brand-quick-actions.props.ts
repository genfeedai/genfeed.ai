import type { ICredential } from '@cloud/interfaces';
import type { CredentialPlatform } from '@genfeedai/enums';
import type { Brand } from '@models/organization/brand.model';
export interface BrandQuickActionsProps {
  brand: Brand;
  connectingStates: Record<string, boolean>;
  onConnect: (brandId: string, platform: CredentialPlatform) => void;
  onOpenInstagramModal: (brand: Brand) => void;
  onDelete: (brand: Brand) => void;
  onDeleteCredential?: (
    credential: ICredential,
    platform: CredentialPlatform,
  ) => void;
  getInstagramStatus: (
    brand: Brand,
  ) => 'connected' | 'partial' | 'disconnected';
}
