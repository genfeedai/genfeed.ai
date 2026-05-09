import type { PrismaClient } from '@genfeedai/desktop-prisma';

export class DesktopKvService {
  private readonly cache = new Map<string, string>();

  constructor(private readonly prisma: PrismaClient) {}

  async init(): Promise<void> {
    const rows = await this.prisma.desktopKv.findMany();

    this.cache.clear();

    for (const row of rows) {
      this.cache.set(row.key, row.value);
    }
  }

  getValueSync(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  async getValue(key: string): Promise<string | null> {
    const value = this.getValueSync(key);

    if (value !== null) {
      return value;
    }

    const row = await this.prisma.desktopKv.findUnique({
      where: { key },
    });

    if (!row) {
      return null;
    }

    this.cache.set(key, row.value);
    return row.value;
  }

  setValueSync(key: string, value: string): void {
    this.cache.set(key, value);
    void this.persistValue(key, value);
  }

  async setValue(key: string, value: string): Promise<void> {
    this.cache.set(key, value);
    await this.persistValue(key, value);
  }

  async deleteValue(key: string): Promise<void> {
    this.cache.delete(key);
    await this.prisma.desktopKv.deleteMany({
      where: { key },
    });
  }

  private async persistValue(key: string, value: string): Promise<void> {
    await this.prisma.desktopKv.upsert({
      create: { key, value },
      update: { value },
      where: { key },
    });
  }
}
