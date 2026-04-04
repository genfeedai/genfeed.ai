export abstract class BaseEntity {
  declare readonly _id: string;
  declare readonly isDeleted: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  [key: string]: unknown;

  constructor(partial: unknown) {
    Object.assign(this, partial);
  }
}
