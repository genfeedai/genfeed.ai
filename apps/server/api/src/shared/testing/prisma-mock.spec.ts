import { MockPrismaClient } from './prisma-mock';

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
