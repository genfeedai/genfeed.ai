import type { IBaseEntity } from '@genfeedai/interfaces';

export abstract class BaseEntity implements IBaseEntity {
  public id!: string;
  public isDeleted!: boolean;
  public createdAt!: string;
  public updatedAt!: string;

  constructor(data: Partial<IBaseEntity> = {}) {
    Object.assign(this, data);
  }
}
