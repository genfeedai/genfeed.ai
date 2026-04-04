import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { Type } from '@nestjs/common';

type SerializableDocument = {
  toObject?: () => Record<string, unknown>;
  [key: string]: unknown;
};

export class EntityFactory {
  static create<T extends BaseEntity>(
    EntityClass: Type<T>,
    partial: Partial<T>,
  ): T {
    return new EntityClass(partial);
  }

  static createBatch<T extends BaseEntity>(
    EntityClass: Type<T>,
    partials: Partial<T>[],
  ): T[] {
    return partials.map((partial) =>
      EntityFactory.create(EntityClass, partial),
    );
  }

  static createWithDefaults<T extends BaseEntity>(
    EntityClass: Type<T>,
    partial: Partial<T>,
    defaults: Partial<T>,
  ): T {
    return EntityFactory.create(EntityClass, { ...defaults, ...partial });
  }

  static transform<T extends BaseEntity>(
    EntityClass: Type<T>,
    data: Record<string, unknown>,
    mapping?: Record<string, string>,
  ): T {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data provided for transformation');
    }

    const transformed: Record<string, unknown> = {};

    if (mapping) {
      Object.entries(mapping).forEach(([targetKey, sourceKey]) => {
        if (sourceKey in data) {
          transformed[targetKey] = data[sourceKey];
        }
      });
    } else {
      Object.assign(transformed, data);
    }

    return EntityFactory.create(EntityClass, transformed as Partial<T>);
  }

  static fromDocument<T extends BaseEntity>(
    EntityClass: Type<T>,
    document: unknown,
    populate: string[] = [],
  ): T {
    if (!document) {
      throw new Error('Invalid document provided');
    }

    const serializedDocument = document as SerializableDocument;
    const plain: Record<string, unknown> = serializedDocument.toObject
      ? serializedDocument.toObject()
      : serializedDocument;

    if (populate.length > 0) {
      populate.forEach((field) => {
        const value = plain[field];
        if (
          value &&
          typeof value === 'object' &&
          (value as Record<string, unknown>)._id
        ) {
          plain[field] = (value as Record<string, unknown>)._id;
        }
      });
    }

    return EntityFactory.create(EntityClass, plain as Partial<T>);
  }

  static fromDocuments<T extends BaseEntity>(
    EntityClass: Type<T>,
    documents: Array<unknown>,
    populate: string[] = [],
  ): T[] {
    return documents.map((doc) =>
      EntityFactory.fromDocument(EntityClass, doc, populate),
    );
  }
}
