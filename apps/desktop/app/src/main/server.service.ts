import type {
  DesktopServerKind,
  IDesktopSelfHostedServerConfig,
  IDesktopServerProfile,
  IDesktopServerSelection,
  IDesktopServerState,
  IDesktopServerValidationResult,
} from '@genfeedai/contracts/desktop';
import {
  buildCloudServerProfile,
  buildSelfHostedServerProfile,
  DesktopServerUrlError,
  normalizeSelfHostedServerConfig,
} from './server-profile.util';
import { buildDesktopSessionStorageKey } from './session.service';
import type { DesktopKeyValueStore } from './store.service';

const SERVER_SELECTION_STORAGE_KEY = 'desktop.server.selection';
const SELF_HOSTED_SERVER_STORAGE_KEY = 'desktop.server.selfHosted';
const SERVER_VALIDATION_TIMEOUT_MS = 5_000;

/** Encrypts values at rest (Electron safeStorage in production). */
export interface DesktopValueCipher {
  decrypt(value: string): string;
  encrypt(value: string): string;
}

interface StoredServerSelection {
  kind: DesktopServerKind;
}

type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<{ json(): Promise<unknown>; ok: boolean; status: number }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSelfHostedConfig(
  value: unknown,
): IDesktopSelfHostedServerConfig | null {
  if (!isRecord(value) || typeof value.apiEndpoint !== 'string') {
    return null;
  }

  const optional = (key: string): string | undefined =>
    typeof value[key] === 'string' ? (value[key] as string) : undefined;

  try {
    return normalizeSelfHostedServerConfig({
      apiEndpoint: value.apiEndpoint,
      appEndpoint: optional('appEndpoint'),
      mcpEndpoint: optional('mcpEndpoint'),
      wsEndpoint: optional('wsEndpoint'),
    });
  } catch {
    return null;
  }
}

/**
 * Owns which Genfeed server (Cloud or a self-hosted API) Desktop talks to.
 * The selection is read once at launch; switching persists the choice and
 * the caller relaunches so every endpoint consumer is rebuilt consistently.
 */
export class DesktopServerService {
  constructor(
    private readonly store: DesktopKeyValueStore,
    private readonly cipher: DesktopValueCipher,
    private readonly defaultProfile: IDesktopServerProfile,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private readEncrypted(key: string): unknown {
    const stored = this.store.getValueSync(key);
    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(this.cipher.decrypt(stored)) as unknown;
    } catch {
      void this.store.deleteValue(key);
      return null;
    }
  }

  private writeEncrypted(key: string, value: unknown): void {
    this.store.setValueSync(key, this.cipher.encrypt(JSON.stringify(value)));
  }

  private readSelection(): StoredServerSelection | null {
    const value = this.readEncrypted(SERVER_SELECTION_STORAGE_KEY);
    return isRecord(value) &&
      (value.kind === 'cloud' || value.kind === 'self-hosted')
      ? { kind: value.kind }
      : null;
  }

  getSelfHostedConfig(): IDesktopSelfHostedServerConfig | null {
    return parseSelfHostedConfig(
      this.readEncrypted(SELF_HOSTED_SERVER_STORAGE_KEY),
    );
  }

  getActiveProfile(): IDesktopServerProfile {
    const selection = this.readSelection();

    if (selection?.kind === 'cloud') {
      return buildCloudServerProfile();
    }

    if (selection?.kind === 'self-hosted') {
      const config = this.getSelfHostedConfig();
      if (config) {
        return buildSelfHostedServerProfile(config);
      }
    }

    return this.defaultProfile;
  }

  getState(): IDesktopServerState {
    const cloud = buildCloudServerProfile();
    const selfHosted = this.getSelfHostedConfig();
    const knownServerIds = new Set([cloud.id, this.defaultProfile.id]);

    if (selfHosted) {
      knownServerIds.add(buildSelfHostedServerProfile(selfHosted).id);
    }

    return {
      active: this.getActiveProfile(),
      cloud,
      defaultProfile: this.defaultProfile,
      isUsingDefault: this.readSelection() === null,
      selfHosted,
      signedInServerIds: [...knownServerIds].filter((serverId) =>
        Boolean(
          this.store.getValueSync(buildDesktopSessionStorageKey(serverId)),
        ),
      ),
    };
  }

  /**
   * Resolves the self-hosted endpoints and confirms the API answers its
   * public health check before Desktop is pointed at it.
   */
  async validateSelfHosted(
    config: IDesktopSelfHostedServerConfig,
  ): Promise<IDesktopServerValidationResult> {
    let profile: IDesktopServerProfile;

    try {
      profile = buildSelfHostedServerProfile(config);
    } catch (error) {
      return {
        error:
          error instanceof DesktopServerUrlError
            ? error.message
            : 'Enter a valid server URL.',
        isValid: false,
      };
    }

    try {
      const response = await this.fetchImpl(`${profile.apiEndpoint}/health`, {
        signal: AbortSignal.timeout(SERVER_VALIDATION_TIMEOUT_MS),
      });

      if (!response.ok) {
        return {
          error: `The server answered HTTP ${String(response.status)} at ${profile.apiEndpoint}/health. Check the API URL (it usually ends in /v1).`,
          isValid: false,
          profile,
        };
      }

      const body = await response.json().catch(() => null);
      if (!isRecord(body) || typeof body.status !== 'string') {
        return {
          error: `${profile.apiEndpoint} did not answer like a Genfeed API.`,
          isValid: false,
          profile,
        };
      }

      return { isValid: true, profile };
    } catch {
      return {
        error: `Could not reach ${profile.apiEndpoint}. Check the URL and that the server is running.`,
        isValid: false,
        profile,
      };
    }
  }

  /** Persists the selection. Returns the profile Desktop must relaunch on. */
  async select(
    selection: IDesktopServerSelection,
  ): Promise<IDesktopServerProfile> {
    if (selection.kind === 'cloud') {
      this.writeEncrypted(SERVER_SELECTION_STORAGE_KEY, { kind: 'cloud' });
      return buildCloudServerProfile();
    }

    if (selection.kind !== 'self-hosted') {
      throw new Error('Unknown Genfeed server type.');
    }

    const config = selection.selfHosted ?? this.getSelfHostedConfig();
    if (!config) {
      throw new Error('Enter the self-hosted server URL first.');
    }

    const validation = await this.validateSelfHosted(config);
    if (!validation.isValid || !validation.profile) {
      throw new Error(validation.error ?? 'The self-hosted server is invalid.');
    }

    this.writeEncrypted(
      SELF_HOSTED_SERVER_STORAGE_KEY,
      normalizeSelfHostedServerConfig(config),
    );
    this.writeEncrypted(SERVER_SELECTION_STORAGE_KEY, {
      kind: 'self-hosted',
    });
    return validation.profile;
  }
}
