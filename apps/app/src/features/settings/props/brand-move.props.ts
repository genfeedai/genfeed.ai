import type { IBrandRelocationPreview } from '@genfeedai/services/social/brand-relocation.types';
import type { Brand } from '@models/organization/brand.model';

export type BrandMoveEntryStatus =
  | 'checking'
  | 'ready'
  | 'blocked'
  | 'moving'
  | 'moved'
  | 'failed';

export interface BrandMoveEntry {
  brand: Brand;
  status: BrandMoveEntryStatus;
  /** Why the brand is blocked or failed; the server's own message. */
  reason?: string;
  preview?: IBrandRelocationPreview;
  membersSevered?: number;
}

export interface BrandMoveDestination {
  id: string;
  label: string;
}

export interface BrandMoveDialogProps {
  brands: Brand[];
  /** Total non-deleted brands in the source org, when the page knows it. */
  sourceBrandCount?: number;
  sourceOrganizationId: string;
  onClose: () => void;
  /** Called once after a batch that moved at least one brand. */
  onMoved: () => Promise<void> | void;
}

/** The slice of next-intl's translator the brand-move helpers use. */
export type BrandMoveTranslate = (
  key: string,
  values?: Record<string, number | string>,
) => string;
