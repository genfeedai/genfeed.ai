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

/**
 * Factory for generating test string IDs (replaces MongoIdFactory).
 * Prisma uses string IDs (cuid/ulid/uuid) — no ObjectId needed.
 */
export class MongoIdFactory {
  static create(): string {
    return 'test-id-' + Math.random().toString(36).slice(2, 9);
  }

  static createString(): string {
    return MongoIdFactory.create();
  }

  static createMany(count: number): string[] {
    return Array.from({ length: count }, () => MongoIdFactory.create());
  }

  static createManyStrings(count: number): string[] {
    return MongoIdFactory.createMany(count);
  }

  static isValid(id: string): boolean {
    return typeof id === 'string' && id.length > 0;
  }
}
