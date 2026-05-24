export abstract class BaseEntity {
  declare readonly _id: string;
  declare readonly id: string;
  declare readonly mongoId: string | null;
  declare readonly organizationId: string;
  declare readonly userId: string;
  declare readonly brandId: string | null;
  declare readonly isDeleted: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  [key: string]: unknown;

  constructor(partial: unknown) {
    Object.assign(this, partial);
  }
}
