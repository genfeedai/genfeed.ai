/**
 * State of one configured external content harness pack. Only `loaded`
 * counts as activated; the API refuses to start on any other state.
 */
export type HarnessPackActivationState =
  | 'invalid'
  | 'load_failed'
  | 'loaded'
  | 'unresolvable';

export interface IHarnessPackActivation {
  error?: string;
  packId?: string;
  packVersion?: string;
  specifier: string;
  state: HarnessPackActivationState;
}

/**
 * Platform-admin view of the content harness packs this API process loaded:
 * the built-in packs, each configured external pack with its state, and every
 * registered pack with its version. Pack contents are never included.
 */
export interface IHarnessActivationReport {
  builtInPackIds: string[];
  external: IHarnessPackActivation[];
  generatedAt: string;
  packs: Array<{ id: string; version: string }>;
}
