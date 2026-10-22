import type { ExtensionPublicationCaptureResult } from '@genfeedai/contracts/interfaces/content/extension-publication.interface';

export interface TrackPostLinkModalProps {
  brandId: string;
  onClose: () => void;
  onTracked: (result: ExtensionPublicationCaptureResult) => void;
}
