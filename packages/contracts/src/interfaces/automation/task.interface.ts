import type { TaskCategory } from '../..';
import type { IBaseEntity } from '../index';

export interface ITask extends IBaseEntity {
  label: string;
  description: string;
  category: TaskCategory;
  status: string;
}
