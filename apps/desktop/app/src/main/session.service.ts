import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type {
  IDesktopSession as IDesktopContractSession,
  IDesktopEnvironment,
} from '@genfeedai/contracts/desktop';
import { safeStorage } from 'electron';
import type { DesktopKeyValueStore } from './store.service';

const SESSION_STORAGE_KEY = 'desktop.session';
const PENDING_AUTH_STORAGE_KEY = 'desktop.pendingAuth';
const DESKTOP_AUTH_SCHEME = 'genfeedai-desktop';
const DESKTOP_AUTH_PATH = 'auth';
const DESKTOP_AUTH_PROTOCOL = `${DESKTOP_AUTH_SCHEME}:`;
const DESKTOP_AUTH_ALLOWED_PATHS = new Set(['', '/']);
const SESSION_COOKIE_NAMES = new Set([
  '__Secure-better-auth.session_token',
  'better-auth.session_token',
]);

interface DesktopAuthExchangeResponse {
  issuedAt?: string;
  session?: unknown;
  token?: string;
  userEmail?: string;
  userId?: string;
  userName?: string;
}

interface DesktopCookieSetDetails {
  expirationDate: number;
  httpOnly: boolean;
  name: string;
  path: string;
  sameSite: 'lax' | 'no_restriction' | 'strict';
  secure: boolean;
  url: string;
  value: string;
}

interface DesktopCookieGetFilter {
  name: string;
  url: string;
}

interface DesktopStoredCookie {
  name: string;
  value: string;
}

export interface DesktopCookieStore {
  get(filter: DesktopCookieGetFilter): Promise<DesktopStoredCookie[]>;
  remove(url: string, name: string): Promise<void>;
  set(details: DesktopCookieSetDetails): Promise<void>;
}

export interface IDesktopSessionCookie {
  cookieName: string;
  cookieValue: string;
  expiresAt: string;
  httpOnly: boolean;
  path: string;
  sameSite: 'lax' | 'none' | 'strict';
  secure: boolean;
}

export interface IDesktopSession extends IDesktopContractSession {
  sessionCookie: IDesktopSessionCookie;
}

export interface IDesktopAuthCallbackError {
  code: 'exchange-failed' | 'invalid-callback' | 'session-cookie-unavailable';
  message: string;
}

export type DesktopAuthCallbackResult =
  | {
      error: IDesktopAuthCallbackError;
      isOk: false;
    }
  | {
      isOk: true;
      session: IDesktopSession;
    };

interface PendingDesktopAuth {
  codeVerifier: string;
  state: string;
}

interface ResolvedDesktopUser {
  userEmail?: string;
  userId: string;
  userName?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const parseDesktopAuthExchangeResponse = (
  value: unknown,
): DesktopAuthExchangeResponse | null => {
  if (!isRecord(value)) {
    return null;
  }

  const { issuedAt, session, token, userEmail, userId, userName } = value;

  if (
    !isOptionalString(issuedAt) ||
    (issuedAt !== undefined && !Number.isFinite(Date.parse(issuedAt))) ||
    !isOptionalString(token) ||
    !isOptionalString(userEmail) ||
    !isOptionalString(userId) ||
    !isOptionalString(userName)
  ) {
    return null;
  }

  return {
    issuedAt,
    session,
    token,
    userEmail,
    userId,
    userName,
  };
};

const parseWhoamiUser = (value: unknown): ResolvedDesktopUser | null => {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.user)) {
    return null;
  }

  const { email, id, name } = value.data.user;

  if (
    !isOptionalString(email) ||
    typeof id !== 'string' ||
    id.length === 0 ||
    !isOptionalString(name)
  ) {
    return null;
  }

  return {
    userEmail: email,
    userId: id,
    userName: name,
  };
};

const parseSessionCookie = (value: unknown): IDesktopSessionCookie | null => {
  if (!isRecord(value)) {
    return null;
  }

  const {
    cookieName,
    cookieValue,
    expiresAt,
    httpOnly,
    path,
    sameSite,
    secure,
  } = value;
  const expirationTime =
    typeof expiresAt === 'string' ? Date.parse(expiresAt) : Number.NaN;

  if (
    typeof cookieName !== 'string' ||
    !SESSION_COOKIE_NAMES.has(cookieName) ||
    typeof cookieValue !== 'string' ||
    cookieValue.length === 0 ||
    typeof expiresAt !== 'string' ||
    !Number.isFinite(expirationTime) ||
    typeof httpOnly !== 'boolean' ||
    path !== '/' ||
    (sameSite !== 'lax' && sameSite !== 'none' && sameSite !== 'strict') ||
    typeof secure !== 'boolean'
  ) {
    return null;
  }

  return {
    cookieName,
    cookieValue,
    expiresAt,
    httpOnly,
    path,
    sameSite,
    secure,
  };
};

const parseDesktopSession = (value: unknown): IDesktopSession | null => {
  if (!isRecord(value)) {
    return null;
  }

  const { issuedAt, sessionCookie, token, userEmail, userId, userName } = value;
  const parsedCookie = parseSessionCookie(sessionCookie);

  if (
    typeof issuedAt !== 'string' ||
    !Number.isFinite(Date.parse(issuedAt)) ||
    !parsedCookie ||
    typeof token !== 'string' ||
    !token.startsWith('gf_') ||
    !isOptionalString(userEmail) ||
    typeof userId !== 'string' ||
    userId.length === 0 ||
    !isOptionalString(userName)
  ) {
    return null;
  }

  return {
    issuedAt,
    sessionCookie: parsedCookie,
    token,
    userEmail,
    userId,
    userName,
  };
};

const serializeSession = (session: IDesktopSession): string =>
  JSON.stringify(session);

const deserializeSession = (value: string): IDesktopSession | null =>
  parseDesktopSession(JSON.parse(value) as unknown);

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
const safeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

const isExpectedDesktopCallbackUrl = (url: URL): boolean =>
  url.protocol === DESKTOP_AUTH_PROTOCOL &&
  url.hostname === DESKTOP_AUTH_PATH &&
  DESKTOP_AUTH_ALLOWED_PATHS.has(url.pathname);

/**
 * Names the cookie, its target URL, and every flag we asked for — without the
 * value — so a failed install is diagnosable from a log line alone.
 */
const describeCookieAttempt = (details: DesktopCookieSetDetails): string =>
  `(name=${details.name} url=${details.url} path=${details.path} secure=${details.secure} httpOnly=${details.httpOnly} sameSite=${details.sameSite} expirationDate=${details.expirationDate})`;

const failedCallback = (
  code: IDesktopAuthCallbackError['code'],
  message: string,
): DesktopAuthCallbackResult => ({
  error: { code, message },
  isOk: false,
});

const parseApiErrorDetail = (value: unknown): string | null => {
  if (!isRecord(value) || !Array.isArray(value.errors)) {
    return null;
  }

  const [first] = value.errors;

  if (!isRecord(first) || typeof first.detail !== 'string') {
    return null;
  }

  const detail = first.detail.trim();
  return detail.length > 0 ? detail : null;
};

const formatExchangeFailureMessage = (
  status: number,
  rawBody: string,
): string => {
  if (status === 401) {
    return 'The Genfeed API blocked desktop sign-in as unauthorized. POST /auth/desktop/exchange must be public.';
  }

  let detail: string | null = null;

  try {
    detail = parseApiErrorDetail(JSON.parse(rawBody) as unknown);
  } catch {
    detail = null;
  }

  if (
    detail &&
    (detail.startsWith('Invalid desktop') ||
      detail.startsWith('Expired desktop') ||
      detail.includes('Better Auth is required'))
  ) {
    return detail;
  }

  return `Genfeed could not finish desktop sign-in (HTTP ${status}). Try again.`;
};

export class DesktopSessionService {
  private pendingAuth: PendingDesktopAuth | null = null;

  constructor(
    private readonly store: DesktopKeyValueStore,
    private readonly environment: IDesktopEnvironment,
    private readonly appOrigin: string,
    private readonly cookies: DesktopCookieStore,
  ) {}

  getEnvironment(): IDesktopEnvironment {
    return this.environment;
  }

  getSession(): IDesktopSession | null {
    const stored = this.store.getValueSync(SESSION_STORAGE_KEY);

    if (!stored) {
      return null;
    }

    try {
      const session = safeStorage.isEncryptionAvailable()
        ? deserializeSession(
            safeStorage.decryptString(Buffer.from(stored, 'base64')),
          )
        : deserializeSession(stored);

      if (!session) {
        void this.store.deleteValue(SESSION_STORAGE_KEY);
      }

      return session;
    } catch {
      void this.store.deleteValue(SESSION_STORAGE_KEY);
      return null;
    }
  }

  private async persistSession(session: IDesktopSession): Promise<void> {
    const payload = serializeSession(session);
    const encryptedPayload = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(payload).toString('base64')
      : payload;

    await this.store.setValue(SESSION_STORAGE_KEY, encryptedPayload);
  }

  private async applySessionCookie(
    sessionCookie: IDesktopSessionCookie,
  ): Promise<void> {
    const expirationDate = Math.floor(
      Date.parse(sessionCookie.expiresAt) / 1_000,
    );

    // The cookie name stays byte-identical to the one the API issued —
    // `__Secure-` prefixed names install fine on `http://127.0.0.1`, because
    // Chromium keys prefix validation to the Secure Contexts "potentially
    // trustworthy origin" definition and loopback qualifies (crbug 40202941).
    // Renaming or downgrading it here would desynchronise the shell cookie jar
    // from what `/v1/auth/get-session` expects.
    const details: DesktopCookieSetDetails = {
      expirationDate,
      httpOnly: sessionCookie.httpOnly,
      name: sessionCookie.cookieName,
      path: sessionCookie.path,
      sameSite:
        sessionCookie.sameSite === 'none'
          ? 'no_restriction'
          : sessionCookie.sameSite,
      secure: sessionCookie.secure,
      url: this.appOrigin,
      value: sessionCookie.cookieValue,
    };

    try {
      await this.cookies.set(details);
    } catch (error) {
      process.stderr.write(
        `[desktop] failed to install Better Auth session cookie ${describeCookieAttempt(details)}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      throw new Error(
        `Desktop session cookie could not be installed ${describeCookieAttempt(details)}.`,
      );
    }

    // `cookies.set` resolving is not proof the jar accepted the cookie: the
    // main-process path layers Electron's own URL/attribute checks on top of
    // Chromium's `CanonicalCookie` validation, and a silently dropped cookie
    // leaves the renderer unauthenticated with no error anywhere. Read it back
    // once per install and fail loudly instead.
    const installed = await this.cookies.get({
      name: details.name,
      url: details.url,
    });

    if (!installed.some((cookie) => cookie.value === details.value)) {
      process.stderr.write(
        `[desktop] Better Auth session cookie was dropped by the cookie jar ${describeCookieAttempt(details)}\n`,
      );
      throw new Error(
        `Desktop session cookie was not retained by the cookie jar ${describeCookieAttempt(details)}.`,
      );
    }
  }

  private async removeSessionCookie(
    sessionCookie: IDesktopSessionCookie,
  ): Promise<void> {
    await this.cookies.remove(this.appOrigin, sessionCookie.cookieName);
  }

  async setSession(session: IDesktopSession): Promise<IDesktopSession> {
    const previousSession = this.getSession();

    if (Date.parse(session.sessionCookie.expiresAt) <= Date.now()) {
      throw new Error('Desktop session cookie is already expired.');
    }

    await this.applySessionCookie(session.sessionCookie);

    try {
      await this.persistSession(session);

      if (
        previousSession &&
        previousSession.sessionCookie.cookieName !==
          session.sessionCookie.cookieName
      ) {
        await this.removeSessionCookie(previousSession.sessionCookie);
      }
    } catch (error) {
      if (previousSession) {
        await this.persistSession(previousSession);
      } else {
        await this.store.deleteValue(SESSION_STORAGE_KEY);
      }

      try {
        await this.removeSessionCookie(session.sessionCookie);
        if (previousSession) {
          await this.applySessionCookie(previousSession.sessionCookie);
        }
      } catch (rollbackError) {
        process.stderr.write(
          `[desktop] failed to roll back session cookie replacement: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}\n`,
        );
      }

      throw error;
    }

    return session;
  }

  async clearSession(): Promise<void> {
    const previousSession = this.getSession();

    if (!previousSession) {
      await this.store.deleteValue(SESSION_STORAGE_KEY);
      return;
    }

    await this.store.deleteValue(SESSION_STORAGE_KEY);

    try {
      await this.removeSessionCookie(previousSession.sessionCookie);
    } catch (error) {
      await this.persistSession(previousSession);
      throw error;
    }
  }

  getLoginUrl(): string {
    const codeVerifier = createCodeVerifier();
    const state = createState();
    this.persistPendingAuth({ codeVerifier, state });

    const url = new URL(this.environment.authEndpoint);
    const returnTo = `${DESKTOP_AUTH_SCHEME}://${DESKTOP_AUTH_PATH}`;
    url.searchParams.set('code_challenge', createCodeChallenge(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('desktop', '1');
    url.searchParams.set('return_to', returnTo);
    url.searchParams.set('state', state);
    return url.toString();
  }

  private persistPendingAuth(pending: PendingDesktopAuth): void {
    this.pendingAuth = pending;
    const payload = JSON.stringify(pending);
    const stored = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(payload).toString('base64')
      : payload;
    this.store.setValueSync(PENDING_AUTH_STORAGE_KEY, stored);
  }

  private readStoredPendingAuth(): PendingDesktopAuth | null {
    const stored = this.store.getValueSync(PENDING_AUTH_STORAGE_KEY);

    if (!stored) {
      return null;
    }

    try {
      const raw = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(stored, 'base64'))
        : stored;
      const parsed = JSON.parse(raw) as unknown;

      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof (parsed as PendingDesktopAuth).codeVerifier !== 'string' ||
        typeof (parsed as PendingDesktopAuth).state !== 'string'
      ) {
        return null;
      }

      return {
        codeVerifier: (parsed as PendingDesktopAuth).codeVerifier,
        state: (parsed as PendingDesktopAuth).state,
      };
    } catch {
      void this.store.deleteValue(PENDING_AUTH_STORAGE_KEY);
      return null;
    }
  }

  private getPendingAuth(): PendingDesktopAuth | null {
    this.pendingAuth ??= this.readStoredPendingAuth();
    return this.pendingAuth;
  }

  private clearPendingAuth(): void {
    this.pendingAuth = null;
    void this.store.deleteValue(PENDING_AUTH_STORAGE_KEY);
  }

  /**
   * Unpackaged/source Electron builds often cannot receive `genfeedai-desktop://`.
   * The browser then shows a one-time authorize code; paste it here (or paste
   * the full callback URL) to finish the same PKCE exchange.
   */
  buildCallbackUrlFromPaste(raw: string): string | null {
    const trimmed = raw.trim();

    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith(`${DESKTOP_AUTH_SCHEME}:`)) {
      return trimmed;
    }

    if (trimmed.includes('://') || /\s/.test(trimmed)) {
      return null;
    }

    if (trimmed.length < 8 || trimmed.length > 2048) {
      return null;
    }

    const pendingState = this.getPendingAuth()?.state;

    if (!pendingState) {
      return null;
    }

    const url = new URL(`${DESKTOP_AUTH_SCHEME}://${DESKTOP_AUTH_PATH}`);
    url.searchParams.set('code', trimmed);
    url.searchParams.set('state', pendingState);
    return url.toString();
  }

  private async resolveUserFromToken(
    token: string,
  ): Promise<ResolvedDesktopUser | null> {
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

      return parseWhoamiUser(await response.json());
    } catch {
      return null;
    }
  }

  private async clearPartialSession(): Promise<void> {
    try {
      await this.clearSession();
    } catch (error) {
      process.stderr.write(
        `[desktop] failed to clear a partial desktop session: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  private async exchangeDesktopCode(
    code: string,
    state: string,
  ): Promise<DesktopAuthCallbackResult> {
    const pendingAuth = this.getPendingAuth();

    if (!pendingAuth || !safeEqual(pendingAuth.state, state)) {
      return failedCallback(
        'invalid-callback',
        'The desktop sign-in request expired. Start sign-in again.',
      );
    }

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
        const errorBody = await response.text().catch(() => '');
        process.stderr.write(
          `[desktop] auth exchange failed: ${response.status} ${errorBody.slice(0, 500)}\n`,
        );
        return failedCallback(
          'exchange-failed',
          formatExchangeFailureMessage(response.status, errorBody),
        );
      }

      this.clearPendingAuth();

      const payload = parseDesktopAuthExchangeResponse(await response.json());
      const sessionCookie = parseSessionCookie(payload?.session);

      if (
        !payload?.token?.startsWith('gf_') ||
        !payload?.userId ||
        !sessionCookie
      ) {
        await this.clearPartialSession();
        return failedCallback(
          'session-cookie-unavailable',
          'Genfeed signed in, but did not return a usable desktop session cookie. Try again after the API is updated.',
        );
      }

      try {
        const session = await this.setSession({
          issuedAt: payload.issuedAt ?? new Date().toISOString(),
          sessionCookie,
          token: payload.token,
          userEmail: payload.userEmail,
          userId: payload.userId,
          userName: payload.userName,
        });

        return { isOk: true, session };
      } catch {
        await this.clearPartialSession();
        return failedCallback(
          'session-cookie-unavailable',
          'The desktop session cookie could not be installed. Sign-in was cancelled safely.',
        );
      }
    } catch {
      return failedCallback(
        'exchange-failed',
        'Genfeed could not finish desktop sign-in. Check your connection and try again.',
      );
    }
  }

  async validateStoredSession(): Promise<IDesktopSession | null> {
    const storedSession = this.getSession();

    if (!storedSession) {
      return null;
    }

    if (Date.parse(storedSession.sessionCookie.expiresAt) <= Date.now()) {
      await this.clearPartialSession();
      return null;
    }

    try {
      await this.applySessionCookie(storedSession.sessionCookie);
    } catch {
      await this.clearPartialSession();
      return null;
    }

    const user = await this.resolveUserFromToken(storedSession.token);

    if (!user) {
      await this.clearPartialSession();
      return null;
    }

    try {
      return await this.setSession({
        ...storedSession,
        ...user,
      });
    } catch {
      await this.clearPartialSession();
      return null;
    }
  }

  async handleCallback(rawUrl: string): Promise<DesktopAuthCallbackResult> {
    try {
      const url = new URL(rawUrl);

      if (!isExpectedDesktopCallbackUrl(url)) {
        return failedCallback(
          'invalid-callback',
          'The desktop sign-in callback was invalid.',
        );
      }

      const error = url.searchParams.get('error');
      const state = url.searchParams.get('state');

      if (error) {
        if (
          state &&
          this.pendingAuth &&
          safeEqual(this.pendingAuth.state, state)
        ) {
          this.pendingAuth = null;
        }

        return failedCallback(
          'exchange-failed',
          'Desktop sign-in was cancelled or denied.',
        );
      }

      const code = url.searchParams.get('code');
      const key = url.searchParams.get('key');

      if (!code || !state || key) {
        return failedCallback(
          'invalid-callback',
          'The desktop sign-in callback was incomplete.',
        );
      }

      return this.exchangeDesktopCode(code, state);
    } catch {
      return failedCallback(
        'invalid-callback',
        'The desktop sign-in callback was invalid.',
      );
    }
  }
}
