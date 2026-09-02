export interface ISocketManagerConfig {
  enableErrorHandling?: boolean;
  errorMessage?: string;
  autoConnect?: boolean;
  resolveToken?: () => Promise<string | null>;
  token?: string;
}
