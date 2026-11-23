export interface RememberedConnectLine {
  status: 'configured' | 'unconfigured';
  /** When the connection was last verified; the time only, never a key. */
  verifiedAt: string | null;
}
