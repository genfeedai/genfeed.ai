import { describe, expect, it } from 'bun:test';
import { DesktopKvService } from './kv.service';

const createPrismaMock = () => {
  const store = new Map<string, string>();

  return {
    desktopKv: {
      deleteMany: async ({ where }: { where: { key: string } }) => {
        store.delete(where.key);
      },
      findMany: async () =>
        Array.from(store.entries()).map(([key, value]) => ({ key, value })),
      findUnique: async ({ where }: { where: { key: string } }) => {
        const value = store.get(where.key);

        if (value === undefined) {
          return null;
        }

        return { key: where.key, value };
      },
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: { key: string; value: string };
        update: { value: string };
        where: { key: string };
      }) => {
        store.set(
          where.key,
          store.has(where.key) ? update.value : create.value,
        );
      },
    },
    store,
  };
};

describe('DesktopKvService', () => {
  it('loads persisted values into the sync cache during init', async () => {
    const prisma = createPrismaMock();
    prisma.store.set('desktop.session', 'persisted');

    const service = new DesktopKvService(prisma as never);
    await service.init();

    expect(service.getValueSync('desktop.session')).toBe('persisted');
    await expect(service.getValue('desktop.session')).resolves.toBe(
      'persisted',
    );
  });

  it('updates the sync cache immediately for setValueSync and persists asynchronously', async () => {
    const prisma = createPrismaMock();
    const service = new DesktopKvService(prisma as never);
    await service.init();

    service.setValueSync('offline.mode', '1');
    expect(service.getValueSync('offline.mode')).toBe('1');

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(prisma.store.get('offline.mode')).toBe('1');
  });

  it('writes and deletes values through the async persistence path', async () => {
    const prisma = createPrismaMock();
    const service = new DesktopKvService(prisma as never);
    await service.init();

    await service.setValue('migration.flag', 'done');
    expect(service.getValueSync('migration.flag')).toBe('done');

    await service.deleteValue('migration.flag');
    expect(service.getValueSync('migration.flag')).toBeNull();
    await expect(service.getValue('migration.flag')).resolves.toBeNull();
  });
});
