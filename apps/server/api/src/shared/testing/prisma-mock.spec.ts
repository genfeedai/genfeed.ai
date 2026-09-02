import {
  canonicalPrismaMock,
  MockPrismaClient,
  mockToPrismaJson,
} from '@api/shared/testing/prisma-mock';

describe('canonicalPrismaMock', () => {
  it('exports the production-compatible JSON serializer', () => {
    const createdAt = new Date('2026-08-20T10:00:00.000Z');

    expect(canonicalPrismaMock().toPrismaJson).toBe(mockToPrismaJson);
    expect(
      mockToPrismaJson({ createdAt, omitted: undefined, value: 'kept' }),
    ).toEqual({
      createdAt: '2026-08-20T10:00:00.000Z',
      value: 'kept',
    });
    expect(mockToPrismaJson(undefined)).toBeNull();
  });
});

describe('MockPrismaClient', () => {
  it('preserves configured delegates in callback transactions', async () => {
    const row = { id: 'task-1' };
    const taskDelegate = {
      findFirst: vi.fn().mockResolvedValue(row),
    };
    const prisma = new MockPrismaClient() as MockPrismaClient & {
      task: typeof taskDelegate;
    };
    prisma.task = taskDelegate;

    const result = await prisma.$transaction(
      async (tx: MockPrismaClient & { task: typeof taskDelegate }) =>
        tx.task.findFirst({ where: { id: row.id } }),
    );

    expect(result).toBe(row);
    expect(taskDelegate.findFirst).toHaveBeenCalledWith({
      where: { id: row.id },
    });
  });
});
