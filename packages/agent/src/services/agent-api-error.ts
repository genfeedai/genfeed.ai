import { Data } from 'effect';

export class AgentApiAuthError extends Data.TaggedError('AgentApiAuthError')<{
  readonly cause: unknown;
  readonly message: string;
}> {}

export class AgentApiRequestError extends Data.TaggedError(
  'AgentApiRequestError',
)<{
  readonly detail?: string;
  readonly message: string;
  readonly status: number;
}> {}

export class AgentApiDecodeError extends Data.TaggedError(
  'AgentApiDecodeError',
)<{
  readonly cause: unknown;
  readonly message: string;
}> {}

export type AgentApiError =
  | AgentApiAuthError
  | AgentApiRequestError
  | AgentApiDecodeError;
