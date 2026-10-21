import type { IBaseEntity } from '@genfeedai/contracts/interfaces';

function hasReadOnlyAccessor(target: object, key: string): boolean {
  for (
    let proto: object | null = Object.getPrototypeOf(target);
    proto && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (descriptor) {
      return Boolean(descriptor.get) && !descriptor.set;
    }
  }
  return false;
}

export abstract class BaseEntity implements IBaseEntity {
  public id!: string;
  public isDeleted!: boolean;
  public createdAt!: string;
  public updatedAt!: string;

  constructor(data: Partial<IBaseEntity> = {}) {
    // Subclasses derive some fields through getters (e.g. Brand.logoUrl). The
    // API can send the same key as a plain attribute; assigning it onto a
    // getter-only accessor throws a TypeError in strict mode.
    for (const [key, value] of Object.entries(data)) {
      if (!hasReadOnlyAccessor(this, key)) {
        Reflect.set(this, key, value);
      }
    }
  }
}
