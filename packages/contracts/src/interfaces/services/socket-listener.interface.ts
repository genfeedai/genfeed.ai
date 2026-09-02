import type { ISocketEventHandler } from '../index';

export interface SocketListener {
  event: string;
  handler: ISocketEventHandler<unknown>;
  originalHandler: ISocketEventHandler<unknown>;
}
