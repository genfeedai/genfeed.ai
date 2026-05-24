import { createHash, randomBytes } from 'node:crypto';
import type {
  IDesktopEnvironment,
  IDesktopSession,
} from '@genfeedai/desktop-contracts';
import { safeStorage } from 'electron';
import type { DesktopKvService } from './kv.service';

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

interface DesktopAuthExchangeResponse {
  issuedAt?: string;
  token?: string;
  userEmail?: string;
  userId?: string;
  userName?: string;
}

interface PendingDesktopAuth {
  codeVerifier: string;
  state: string;
}

const serializeSession = (session: IDesktopSession): string =>
  JSON.stringify(session);

const deserializeSession = (value: string): IDesktopSession =>
  JSON.parse(value) as IDesktopSession;

const toBase64Url = (input: Buffer): string =>
  input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const createCodeVerifier = (): string => toBase64Url(randomBytes(32));
const createState = (): string => toBase64Url(randomBytes(24));
const createCodeChallenge = (verifier: string): string =>
  toBase64Url(createHash('sha256').update(verifier).digest());

export class DesktopSessionService {
  private pendingAuth: PendingDesktopAuth | null = null;

  constructor(
    private readonly kvService: DesktopKvService,
    private readonly environment: IDesktopEnvironment,
  ) {}

  getEnvironment(): IDesktopEnvironment {
    return this.environment;
  }

  getSession(): IDesktopSession | null {
    const stored = this.kvService.getValueSync(SESSION_STORAGE_KEY);

    if (!stored) {
      return null;
    }

    try {
      return safeStorage.isEncryptionAvailable()
        ? deserializeSession(
            safeStorage.decryptString(Buffer.from(stored, 'base64')),
          )
        : deserializeSession(stored);
    } catch {
      void this.clearSession();
      return null;
    }
  }

  async setSession(session: IDesktopSession): Promise<IDesktopSession> {
    const payload = serializeSession(session);
    const encryptedPayload = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(payload).toString('base64')
      : payload;

    await this.kvService.setValue(SESSION_STORAGE_KEY, encryptedPayload);
    return session;
  }

  async clearSession(): Promise<void> {
    await this.kvService.deleteValue(SESSION_STORAGE_KEY);
  }

  getLoginUrl(): string {
    const codeVerifier = createCodeVerifier();
    const state = createState();
    this.pendingAuth = { codeVerifier, state };

    const url = new URL(this.environment.authEndpoint);
    const returnTo = `${DESKTOP_AUTH_SCHEME}://${DESKTOP_AUTH_PATH}`;
    url.searchParams.set('code_challenge', createCodeChallenge(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('desktop', '1');
    url.searchParams.set('return_to', returnTo);
    url.searchParams.set('state', state);
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

  private async exchangeDesktopCode(
    code: string,
    state: string,
  ): Promise<IDesktopSession | null> {
    const pendingAuth = this.pendingAuth;

    if (!pendingAuth || pendingAuth.state !== state) {
      return null;
    }

    this.pendingAuth = null;

    try {
      const response = await fetch(
        `${this.environment.apiEndpoint}/auth/desktop/exchange`,
        {
          body: JSON.stringify({
            code,
            codeVerifier: pendingAuth.codeVerifier,
            state,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as DesktopAuthExchangeResponse;

      if (!payload.token || !payload.userId) {
        return null;
      }

      return this.setSession({
        issuedAt: payload.issuedAt ?? new Date().toISOString(),
        token: payload.token,
        userEmail: payload.userEmail,
        userId: payload.userId,
        userName: payload.userName,
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
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (code && state) {
        const session = await this.exchangeDesktopCode(code, state);

        if (!session) {
          await this.clearSession();
        }

        return session;
      }

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
