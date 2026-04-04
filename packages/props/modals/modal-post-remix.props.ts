import type { IPost } from '@cloud/interfaces';

export interface ModalPostRemixProps {
  post: IPost;
  isOpen?: boolean;
  openKey?: number | string;
  onSubmit: (description: string, label?: string) => Promise<void>;
  onClose?: () => void;
}
