import type { IReferralCode } from '@genfeedai/contracts/interfaces';

export interface ReferralCodesCardProps {
  codes: IReferralCode[];
  /** Brands of the active organization a code can be shared for. */
  brands: Array<{ id: string; label: string; slug: string }>;
  isLoading: boolean;
  onCopy: (shareUrl: string) => void;
  onCreate: (input: { brandId?: string; code?: string }) => Promise<void>;
  onSetActive: (codeId: string, isActive: boolean) => Promise<void>;
}
