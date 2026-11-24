import type { ConnectionOptions } from 'bullmq';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

interface LazyBullBoardOptions {
  /** Mount path of the board; Bull Board builds its links from it. */
  basePath: string;
  connection: ConnectionOptions;
  queueNames: readonly string[];
}

/**
 * Express handler for Bull Board that builds the board on its first request.
 *
 * The board needs Bull Board's packages (about 4 MB of live heap) and one
 * `Queue` per queue name, each with its own Redis connection. An operator
 * opens it rarely, so every API process used to pay that from its first
 * second. The first request builds it; a build that fails is not kept, so the
 * next request tries again.
 */
export function createLazyBullBoardRouter(
  options: LazyBullBoardOptions,
): RequestHandler {
  let building: Promise<RequestHandler> | undefined;

  const build = async (): Promise<RequestHandler> => {
    const [{ createBullBoard }, { BullMQAdapter }, { ExpressAdapter }, bullmq] =
      await Promise.all([
        import('@bull-board/api'),
        import('@bull-board/api/bullMQAdapter'),
        import('@bull-board/express'),
        import('bullmq'),
      ]);
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath(options.basePath);
    createBullBoard({
      queues: options.queueNames.map(
        (name) =>
          new BullMQAdapter(
            new bullmq.Queue(name, { connection: options.connection }),
          ),
      ),
      serverAdapter,
    });
    return serverAdapter.getRouter();
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    building ??= build();
    building.then(
      (router) => router(req, res, next),
      (error: unknown) => {
        building = undefined;
        next(error);
      },
    );
  };
}
