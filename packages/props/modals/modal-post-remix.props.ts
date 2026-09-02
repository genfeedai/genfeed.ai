import type { IPost } from '@genfeedai/contracts/interfaces';

export interface ModalPostRemixProps {
  post: IPost;
  isOpen?: boolean;
  openKey?: number | string;
  onSubmit: (description: string, label?: string) => Promise<void>;
  onClose?: () => void;
}
