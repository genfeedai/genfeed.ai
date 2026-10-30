import type { IPostingCadence } from '@genfeedai/contracts/interfaces';
import type { CreatePostingCadenceInput } from '@services/content/posting-cadences.service';

export type CadenceFormSheetProps = {
  brandId: string;
  cadence?: IPostingCadence | null;
  credentialId: string;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onDelete?: () => void;
  onSubmit: (input: CreatePostingCadenceInput) => void;
};
