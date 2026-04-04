import type { IBaseEntity } from '../index';

export interface IRole extends IBaseEntity {
  label: string;
  key: string;
  primaryColor?: string;
}
