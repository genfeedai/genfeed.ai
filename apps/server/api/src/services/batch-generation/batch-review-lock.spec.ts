import { EventEmitter } from 'node:events';
import { BatchReviewLockService } from './batch-review-lock';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
}));
vi.mock('pg', () => ({
  Pool: class {
    connect = mocks.connect;
    end = mocks.end;
    on = mocks.on;
  },
}));
function setup() {
  const client = Object.assign(new EventEmitter(), {
    query: vi
      .fn()
      .mockResolvedValue({ rows: [{ acquired: true, released: true }] }),
    release: vi.fn(),
  });
  mocks.connect.mockResolvedValue(client);
  const service = new BatchReviewLockService(
    {
      get: (key: string) =>
        key === 'DATABASE_URL' ? 'postgresql://localhost/test' : undefined,
    } as never,
    { warn: vi.fn() } as never,
  );
  return { service, client };
}
describe('Batch review dedicated lock transactions', () => {
  beforeEach(() => vi.clearAllMocks());
  it('sorts all locks on one connection and keeps nested calls reentrant until release', async () => {
    const { service, client } = setup();
    await service.run(['b', 'a', 'b'], 'org', async () => {
      expect(client.release).not.toHaveBeenCalled();
      await service.run(['a'], 'org', async () => service.assertActive());
    });
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(
      client.query.mock.calls
        .filter((call) => call[1])
        .map((call) => call[1][0]),
    ).toEqual(['batch-review:org:a', 'batch-review:org:b']);
    expect(client.release).toHaveBeenCalledWith(false);
  });
  it('fails closed on connection loss and destroys the session', async () => {
    const { service, client } = setup();
    await expect(
      service.run(['a'], 'org', async () => {
        client.emit('error', new Error('lost'));
        service.assertActive();
      }),
    ).rejects.toThrow('lock was lost');
    expect(client.release).toHaveBeenCalledWith(true);
  });
  it('releases on operation failure and destroys a connection whose unlock fails', async () => {
    const { service, client } = setup();
    client.query.mockImplementation(async (sql: string) => {
      if (sql === 'ROLLBACK') throw new Error('rollback failed');
      return { rows: [{ acquired: true }] };
    });
    await expect(
      service.run(['a'], 'org', async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    expect(client.release).toHaveBeenCalledWith(true);
    await service.onModuleDestroy();
    expect(mocks.end).toHaveBeenCalled();
  });
});
