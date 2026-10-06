import type { IModel } from '@genfeedai/contracts/interfaces';

export interface ModelAvatarProps {
  model: Pick<IModel, 'category' | 'provider'>;
  className?: string;
  testId?: string;
}
