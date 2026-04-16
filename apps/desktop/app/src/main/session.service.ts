import { randomUUID } from 'node:crypto';
import type {
  IDesktopEnvironment,
  IDesktopSession,
} from '@genfeedai/desktop-contracts';
import { safeStorage } from 'electron';
import type { CloudDatabaseService } from './cloud-database.service';

const SESSION_STORAGE_KEY = 'desktop.session';
const DESKTOP_AUTH_SCHEME = 'genfeedai-desktop';
const DESKTOP_AUTH_PATH = 'auth';

interface AuthWhoamiResponse {
  data?: {
    user?: {
      email?: string;
      id?: string;
      name?: string;
    };
  };
}

const serializeSession = (session: IDesktopSession): string =>
  JSON.stringify(session);

const deserializeSession = (value: string): IDesktopSession =>
  JSON.parse(value) as IDesktopSession;

export class DesktopSessionService {
  constructor(
    private readonly database: CloudDatabaseService,
    private readonly environment: IDesktopEnvironment,
  ) {}

  getEnvironment(): IDesktopEnvironment {
    return this.environment;
  }

  getSession(): IDesktopSession | null {
    const stored = this.database.getValue(SESSION_STORAGE_KEY);

    if (!stored) {
      return null;
    }

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(
          Buffer.from(stored, 'base64'),
        );
        return deserializeSession(decrypted);
      }

      return deserializeSession(stored);
    } catch {
      this.database.deleteValue(SESSION_STORAGE_KEY);
      return null;
    }
  }

  setSession(session: IDesktopSession): IDesktopSession {
    const payload = serializeSession(session);
    const encryptedPayload = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(payload).toString('base64')
      : payload;

    this.database.setValue(SESSION_STORAGE_KEY, encryptedPayload);

    return session;
  }

  clearSession(): void {
    this.database.deleteValue(SESSION_STORAGE_KEY);
  }

  getLoginUrl(): string {
    const url = new URL(this.environment.authEndpoint);
    const returnTo = `${DESKTOP_AUTH_SCHEME}://${DESKTOP_AUTH_PATH}`;
    url.searchParams.set('desktop', '1');
    url.searchParams.set('return_to', returnTo);
    return url.toString();
  }

  private async resolveSessionFromKey(
    key: string,
  ): Promise<IDesktopSession | null> {
    try {
      const response = await fetch(
        `${this.environment.apiEndpoint}/auth/whoami`,
        {
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as AuthWhoamiResponse;
      const user = payload.data?.user;

      return this.setSession({
        issuedAt: new Date().toISOString(),
        token: key,
        userEmail: user?.email || undefined,
        userId: user?.id || randomUUID(),
        userName: user?.name || undefined,
      });
    } catch {
      return null;
    }
  }

  async handleCallback(rawUrl: string): Promise<IDesktopSession | null> {
    try {
      const url = new URL(rawUrl);
      const key = url.searchParams.get('key');

      if (!key) {
        return null;
      }

      const session = await this.resolveSessionFromKey(key);

      if (!session) {
        this.clearSession();
      }

      return session;
    } catch {
      return null;
    }
  }
}
