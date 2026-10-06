import type { IModel } from '@genfeedai/contracts/interfaces';

export interface ModelAvatarProps {
  model: Pick<IModel, 'category' | 'provider'> &
    Partial<Pick<IModel, 'key' | 'capabilities'>>;
  className?: string;
  testId?: string;
}
