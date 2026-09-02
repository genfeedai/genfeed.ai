import type { Platform, PostRepurposeMode } from '@genfeedai/contracts';

/**
 * Minimal source shape so the repurpose modal serves both post surfaces
 * (IPost) and the release drawer (IChannelTarget) without conversion.
 */
export interface PostRepurposeSource {
  id: string;
  label?: string | null;
  platform?: string | null;
}

export interface ModalPostRepurposeProps {
  source: PostRepurposeSource;
  isOpen?: boolean;
  openKey?: number | string;
  onSubmit: (platform: Platform, mode: PostRepurposeMode) => Promise<void>;
  onClose?: () => void;
}
