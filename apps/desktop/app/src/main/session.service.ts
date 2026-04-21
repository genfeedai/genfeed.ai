import type {
  IDesktopEnvironment,
  IDesktopSession,
} from '@genfeedai/desktop-contracts';
import { safeStorage } from 'electron';
import type { DesktopDatabaseService } from './database.service';

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
  private currentSession: IDesktopSession | null = null;

  constructor(
    private readonly database: DesktopDatabaseService,
    private readonly environment: IDesktopEnvironment,
  ) {}

  getEnvironment(): IDesktopEnvironment {
    return this.environment;
  }

  async initialize(): Promise<IDesktopSession | null> {
    const stored = await this.database.getValue(SESSION_STORAGE_KEY);

    if (!stored) {
      this.currentSession = null;
      return null;
    }

    try {
      const session = safeStorage.isEncryptionAvailable()
        ? deserializeSession(
            safeStorage.decryptString(Buffer.from(stored, 'base64')),
          )
        : deserializeSession(stored);

      this.currentSession = session;
      return session;
    } catch {
      this.currentSession = null;
      await this.database.deleteValue(SESSION_STORAGE_KEY);
      return null;
    }
  }

  getSession(): IDesktopSession | null {
    return this.currentSession;
  }

  async setSession(session: IDesktopSession): Promise<IDesktopSession> {
    const payload = serializeSession(session);
    const encryptedPayload = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(payload).toString('base64')
      : payload;

    this.currentSession = session;
    await this.database.setValue(SESSION_STORAGE_KEY, encryptedPayload);
    return session;
  }

  async clearSession(): Promise<void> {
    this.currentSession = null;
    await this.database.deleteValue(SESSION_STORAGE_KEY);
  }

  getLoginUrl(): string {
    const url = new URL(this.environment.authEndpoint);
    const returnTo = `${DESKTOP_AUTH_SCHEME}://${DESKTOP_AUTH_PATH}`;
    url.searchParams.set('desktop', '1');
    url.searchParams.set('return_to', returnTo);
    return url.toString();
  }

  private async resolveSessionFromToken(
    token: string,
    issuedAt = new Date().toISOString(),
  ): Promise<IDesktopSession | null> {
    try {
      const response = await fetch(
        `${this.environment.apiEndpoint}/auth/whoami`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as AuthWhoamiResponse;
      const user = payload.data?.user;
      const userId = user?.id;

      if (!userId) {
        return null;
      }

      return this.setSession({
        issuedAt,
        token,
        userEmail: user?.email || undefined,
        userId,
        userName: user?.name || undefined,
      });
    } catch {
      return null;
    }
  }

  async validateStoredSession(): Promise<IDesktopSession | null> {
    const session = this.getSession();

    if (!session) {
      return null;
    }

    const validatedSession = await this.resolveSessionFromToken(
      session.token,
      session.issuedAt,
    );

    if (!validatedSession) {
      await this.clearSession();
    }

    return validatedSession;
  }

  async handleCallback(rawUrl: string): Promise<IDesktopSession | null> {
    try {
      const url = new URL(rawUrl);
      const key = url.searchParams.get('key');

      if (!key) {
        return null;
      }

      const session = await this.resolveSessionFromToken(key);

      if (!session) {
        await this.clearSession();
      }

      return session;
    } catch {
      return null;
    }
  }
}
