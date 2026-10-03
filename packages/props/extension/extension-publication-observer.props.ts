import type { PublicationCaptureView } from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
export interface PublicationCaptureEntryProps {
  entry: PublicationCaptureView;
  isEnabled: boolean;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}
