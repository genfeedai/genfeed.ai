export class AgentApiAuthError extends Error {
  readonly _tag = 'AgentApiAuthError';
  readonly cause: unknown;

  constructor(options: { cause: unknown; message: string }) {
    super(options.message);
    this.name = 'AgentApiAuthError';
    this.cause = options.cause;
  }
}

export class AgentApiRequestError extends Error {
  readonly _tag = 'AgentApiRequestError';
  readonly detail?: string;
  readonly source?:
    | 'acknowledgement'
    | 'api'
    | 'network'
    | 'provider'
    | 'stream_recovery';
  readonly status: number;

  constructor(options: {
    detail?: string;
    message: string;
    source?:
      | 'acknowledgement'
      | 'api'
      | 'network'
      | 'provider'
      | 'stream_recovery';
    status: number;
  }) {
    super(options.message);
    this.name = 'AgentApiRequestError';
    this.detail = options.detail;
    this.source = options.source;
    this.status = options.status;
  }
}

export class AgentApiDecodeError extends Error {
  readonly _tag = 'AgentApiDecodeError';
  readonly cause: unknown;

  constructor(options: { cause: unknown; message: string }) {
    super(options.message);
    this.name = 'AgentApiDecodeError';
    this.cause = options.cause;
  }
}

export type AgentApiError =
  | AgentApiAuthError
  | AgentApiRequestError
  | AgentApiDecodeError;
