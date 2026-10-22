import type { ExtensionPublicationCaptureResult } from '@genfeedai/contracts/interfaces/content/extension-publication.interface';
import type { RefObject } from 'react';

export interface TrackPostLinkModalProps {
  brandId: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onTracked: (result: ExtensionPublicationCaptureResult) => void;
}
