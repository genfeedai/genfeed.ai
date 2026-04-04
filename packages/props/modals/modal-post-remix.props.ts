import type { IPost } from '@genfeedai/interfaces';

export interface ModalPostRemixProps {
  post: IPost;
  isOpen?: boolean;
  openKey?: number | string;
  onSubmit: (description: string, label?: string) => Promise<void>;
  onClose?: () => void;
}
