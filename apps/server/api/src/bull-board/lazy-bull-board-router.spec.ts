import { createLazyBullBoardRouter } from '@api/bull-board/lazy-bull-board-router';
import type { NextFunction, Request, Response } from 'express';

const board = vi.hoisted(() => ({
  boardsBuilt: 0,
  failNextBuild: false,
  handled: [] as string[],
  queuesCreated: [] as string[],
}));

vi.mock('@bull-board/api', () => ({
  createBullBoard: () => {
    if (board.failNextBuild) {
      board.failNextBuild = false;
      throw new Error('redis not reachable');
    }
    board.boardsBuilt += 1;
  },
}));
vi.mock('@bull-board/api/bullMQAdapter', () => ({
  BullMQAdapter: class {
    constructor(readonly queue: unknown) {}
  },
}));
vi.mock('@bull-board/express', () => ({
  ExpressAdapter: class {
    basePath = '';
    setBasePath(path: string) {
      this.basePath = path;
    }
    getRouter() {
      return (req: Request) => {
        board.handled.push(`${this.basePath}${req.url}`);
      };
    }
  },
}));
vi.mock('bullmq', () => ({
  Queue: class {
    constructor(name: string) {
      board.queuesCreated.push(name);
    }
  },
}));

function request(url: string): Request {
  return { url } as Request;
}

describe('createLazyBullBoardRouter', () => {
  beforeEach(() => {
    board.boardsBuilt = 0;
    board.failNextBuild = false;
    board.handled = [];
    board.queuesCreated = [];
  });

  function create() {
    return createLazyBullBoardRouter({
      basePath: '/admin/queues',
      connection: {},
      queueNames: ['alpha', 'beta'],
    });
  }

  it('builds nothing until the first request', () => {
    create();

    expect(board.boardsBuilt).toBe(0);
    expect(board.queuesCreated).toEqual([]);
  });

  it('builds the board once for concurrent first requests and serves them all', async () => {
    const handler = create();
    const next = vi.fn();

    handler(request('/'), {} as Response, next);
    handler(request('/api/queues'), {} as Response, next);
    await vi.waitFor(() => expect(board.handled).toHaveLength(2));
    handler(request('/later'), {} as Response, next);
    await vi.waitFor(() => expect(board.handled).toHaveLength(3));

    expect(board.boardsBuilt).toBe(1);
    expect(board.queuesCreated).toEqual(['alpha', 'beta']);
    expect(board.handled).toEqual([
      '/admin/queues/',
      '/admin/queues/api/queues',
      '/admin/queues/later',
    ]);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes a failed build to next and tries again on the next request', async () => {
    const handler = create();
    board.failNextBuild = true;
    const next = vi.fn<NextFunction>();

    handler(request('/'), {} as Response, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    expect(next.mock.calls[0][0]).toEqual(new Error('redis not reachable'));

    handler(request('/'), {} as Response, next);
    await vi.waitFor(() => expect(board.handled).toHaveLength(1));
    expect(board.boardsBuilt).toBe(1);
  });
});
