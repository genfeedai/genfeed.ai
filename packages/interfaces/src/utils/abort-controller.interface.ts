export interface IAbortControllerConfig {
  timeout?: number;
  reason?: string;
  autoAbort?: boolean;
}

export interface IUseAbortController {
  signal: AbortSignal;
  abort: (reason?: string) => void;
  isAborted: boolean;
  reset: () => void;
}
