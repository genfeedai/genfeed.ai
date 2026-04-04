import type { User } from '@clerk/backend';

/**
 * Generic HTTP server instance
 * Represents Express or similar HTTP server
 */
export interface HttpServer {
  get(path: string, handler: RequestHandler): void;
  post(path: string, handler: RequestHandler): void;
  use(...handlers: RequestHandler[]): void;
  /** Allow additional server methods */
  [key: string]: unknown;
}

/**
 * Generic request handler function
 */
export type RequestHandler = (
  req: unknown,
  res: unknown,
  next?: unknown,
) => void | Promise<void>;

/**
 * Generic HTTP request with body
 * Represents Express Request-like objects
 */
export interface RequestWithBody {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
  params?: Record<string, unknown>;
  query: Record<string, unknown>;
  route?: { path?: string };
  user?: User;
}

/**
 * Generic HTTP response object
 */
export interface ResponseObject {
  status(code: number): this;
  json(data: unknown): this;
  send(data: unknown): this;
  /** Allow additional response methods */
  [key: string]: unknown;
}
