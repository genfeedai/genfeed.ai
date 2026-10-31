import type { ITrendVideo } from '@genfeedai/contracts/interfaces';

export interface ModalHookRemixProps {
  video: ITrendVideo | null;
  isOpen?: boolean;
  openKey?: number | string;
  onSubmit?: (jobId: string) => void;
  onClose?: () => void;
}
