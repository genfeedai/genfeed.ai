import { headers } from 'next/headers';

type DesktopServerAuth = {
  getToken: () => Promise<string | null>;
  sessionId: string | null;
  userId: string | null;
};

function getHeaderToken(headersStore: Awaited<ReturnType<typeof headers>>): {
  token: string | null;
  userId: string | null;
} {
  const token = headersStore.get('x-genfeed-desktop-token')?.trim() || null;
  const userId = headersStore.get('x-genfeed-desktop-user-id')?.trim() || null;

  return { token, userId };
}

export async function auth(): Promise<DesktopServerAuth> {
  if (process.env.NEXT_PUBLIC_DESKTOP_SHELL !== '1') {
    return {
      getToken: async () => null,
      sessionId: null,
      userId: null,
    };
  }

  const headerStore = await headers();
  const { token, userId } = getHeaderToken(headerStore);

  return {
    getToken: async () => token,
    sessionId: token ? (userId ?? 'desktop-session') : null,
    userId,
  };
}

function normalizeRoutePattern(pattern: string): {
  exact: boolean;
  value: string;
} {
  if (pattern.endsWith('(.*)')) {
    return { exact: false, value: pattern.slice(0, -4) };
  }

  return { exact: true, value: pattern };
}

export function createRouteMatcher(patterns: string[]) {
  return (request: { nextUrl?: { pathname?: string } }) => {
    const pathname = request.nextUrl?.pathname ?? '';

    return patterns.some((pattern) => {
      const normalized = normalizeRoutePattern(pattern);
      return normalized.exact
        ? pathname === normalized.value
        : pathname.startsWith(normalized.value);
    });
  };
}

export function clerkMiddleware<
  TRequest extends { nextUrl?: { pathname?: string } },
  TEvent,
  TResult,
>(
  handler: (
    authFn: () => Promise<DesktopServerAuth>,
    request: TRequest,
    event: TEvent,
  ) => TResult,
) {
  return (request: TRequest, event: TEvent) => handler(auth, request, event);
}
