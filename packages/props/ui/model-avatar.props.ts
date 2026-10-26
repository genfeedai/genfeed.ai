import type { IModel } from '@genfeedai/contracts/interfaces';

export interface ModelAvatarProps {
  /** The media-type badge on the avatar's corner. */
  isCategoryVisible?: boolean;
  isProviderVisible?: boolean;
  model: Pick<IModel, 'category' | 'provider'> &
    Partial<Pick<IModel, 'key' | 'capabilities'>>;
  className?: string;
  testId?: string;
}
