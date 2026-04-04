import { Types } from 'mongoose';

export abstract class BaseFactory<T> {
  protected abstract getDefaults(): Partial<T>;

  create(overrides: Partial<T> = {}): T {
    return {
      ...this.getDefaults(),
      ...overrides,
    } as T;
  }

  createMany(count: number, overrides: Partial<T> = {}): T[] {
    return Array.from({ length: count }, () => this.create(overrides));
  }

  async createAsync(overrides: Partial<T> = {}): Promise<T> {
    return Promise.resolve(this.create(overrides));
  }

  async createManyAsync(
    count: number,
    overrides: Partial<T> = {},
  ): Promise<T[]> {
    return Promise.resolve(this.createMany(count, overrides));
  }
}

export class MongoIdFactory {
  static create(): Types.ObjectId {
    return new Types.ObjectId();
  }

  static createString(): string {
    return new Types.ObjectId().toString();
  }

  static createMany(count: number): Types.ObjectId[] {
    return Array.from({ length: count }, () => MongoIdFactory.create());
  }

  static createManyStrings(count: number): string[] {
    return Array.from({ length: count }, () => MongoIdFactory.createString());
  }

  static isValid(id: string | Types.ObjectId): boolean {
    return Types.ObjectId.isValid(id);
  }
}
