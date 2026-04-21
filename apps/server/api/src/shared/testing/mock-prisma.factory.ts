import { vi } from 'vitest';

/**
 * Creates a mock PrismaService delegate for a single model.
 * Returns an object with all Prisma query methods stubbed with vi.fn().
 *
 * Usage:
 *   const delegate = createMockDelegate({ id: 'mock-id', isDeleted: false });
 *   const mockPrisma = { elementSound: delegate } as unknown as PrismaService;
 *   service = new MySoundsService(mockPrisma, mockLogger);
 */
export function createMockDelegate(
  defaults: Record<string, unknown> = {},
): Record<string, ReturnType<typeof vi.fn>> {
  const savedDoc = { id: 'mock-id', ...defaults };

  return {
    aggregate: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue(savedDoc),
    delete: vi.fn().mockResolvedValue(savedDoc),
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(savedDoc),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
}

/**
 * Creates a mock PrismaService with a single model delegate.
 *
 * Usage:
 *   const mockPrisma = createMockPrismaForModel('elementSound', { isDeleted: false, key: 'test' });
 *   service = new ElementsSoundsService(mockPrisma as never, mockLogger);
 */
export function createMockPrismaForModel(
  modelName: string,
  defaults: Record<string, unknown> = {},
): Record<string, Record<string, ReturnType<typeof vi.fn>>> {
  return {
    [modelName]: createMockDelegate(defaults),
  };
}
