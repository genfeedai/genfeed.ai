export const PORTLESS_SERVICES = [
  'app',
  'api',
  'docs',
  'files',
  'mcp',
  'notifications',
  'website',
] as const;

export type PortlessService = (typeof PORTLESS_SERVICES)[number];

export type PortlessOrigins = Record<PortlessService, string>;

type PortlessEnvironmentOptions = {
  currentService: PortlessService;
  existingEnv: Readonly<Record<string, string | undefined>>;
  portlessUrl: string;
};

const APP_REDIRECT_KEYS = [
  'APP_MEDIUM_REDIRECT_URI',
  'DISCORD_REDIRECT_URI',
  'FACEBOOK_REDIRECT_URI',
  'FANVUE_REDIRECT_URI',
  'GOOGLE_ADS_REDIRECT_URI',
  'GOOGLE_SEARCH_CONSOLE_REDIRECT_URI',
  'INSTAGRAM_REDIRECT_URI',
  'LINKEDIN_REDIRECT_URI',
  'MEDIUM_REDIRECT_URI',
  'OPENAI_CODEX_REDIRECT_URI',
  'PINTEREST_REDIRECT_URI',
  'REDDIT_REDIRECT_URI',
  'SHOPIFY_REDIRECT_URI',
  'SLACK_REDIRECT_URI',
  'SNAPCHAT_REDIRECT_URI',
  'THREADS_REDIRECT_URI',
  'TWITTER_REDIRECT_URI',
  'WORDPRESS_REDIRECT_URI',
  'YOUTUBE_REDIRECT_URI',
] as const;

function withPath(origin: string, pathname: string): string {
  return new URL(pathname, `${origin}/`).toString().replace(/\/$/u, '');
}

function websocketOrigin(origin: string): string {
  const url = new URL(origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.origin;
}

function replaceOrigin(value: string, origin: string): string {
  const url = new URL(value);
  const replacement = new URL(origin);
  url.protocol = replacement.protocol;
  url.host = replacement.host;
  return url.toString();
}

function appendTrustedOrigins(
  existingValue: string | undefined,
  origins: string[],
): string {
  return [
    ...new Set([
      ...(existingValue ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      ...origins,
    ]),
  ].join(',');
}

export function isPortlessService(value: string): value is PortlessService {
  return PORTLESS_SERVICES.includes(value as PortlessService);
}

export function resolvePortlessOrigins(
  currentService: PortlessService,
  portlessUrl: string,
): PortlessOrigins {
  const currentUrl = new URL(portlessUrl);
  const labels = currentUrl.hostname.split('.');
  const serviceLabelIndex = labels.findIndex(
    (label, index) =>
      label === currentService && labels[index + 1] === 'genfeed',
  );

  if (serviceLabelIndex === -1) {
    throw new Error(
      `PORTLESS_URL host ${currentUrl.host} does not contain ${currentService}.genfeed`,
    );
  }

  return Object.fromEntries(
    PORTLESS_SERVICES.map((service) => {
      const serviceUrl = new URL(currentUrl);
      const serviceLabels = [...labels];
      serviceLabels[serviceLabelIndex] = service;
      serviceUrl.hostname = serviceLabels.join('.');
      return [service, serviceUrl.origin];
    }),
  ) as PortlessOrigins;
}

export function buildPortlessEnvironment({
  currentService,
  existingEnv,
  portlessUrl,
}: PortlessEnvironmentOptions): Record<string, string> {
  const origins = resolvePortlessOrigins(currentService, portlessUrl);
  const browserApiOrigin = currentService === 'app' ? origins.app : origins.api;

  const environment: Record<string, string> = {
    API_BASE_URL: origins.api,
    API_URL: origins.api,
    BETTER_AUTH_TRUSTED_ORIGINS: appendTrustedOrigins(
      existingEnv.BETTER_AUTH_TRUSTED_ORIGINS,
      [origins.app, origins.website],
    ),
    BETTER_AUTH_URL: origins.api,
    GENFEEDAI_API_PUBLIC_URL: origins.api,
    GENFEEDAI_API_URL: origins.api,
    GENFEEDAI_APP_URL: origins.app,
    GENFEEDAI_MCP_PUBLIC_URL: withPath(origins.mcp, '/mcp'),
    GENFEEDAI_MICROSERVICES_FILES_URL: origins.files,
    GENFEEDAI_MICROSERVICES_MCP_URL: origins.mcp,
    GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL: origins.notifications,
    GENFEEDAI_PUBLIC_URL: origins.website,
    NEXT_PUBLIC_API_ENDPOINT: withPath(browserApiOrigin, '/v1'),
    NEXT_PUBLIC_API_URL: withPath(browserApiOrigin, '/v1'),
    NEXT_PUBLIC_APPS_APP_ENDPOINT: origins.app,
    NEXT_PUBLIC_APPS_WEBSITE_ENDPOINT: origins.website,
    NEXT_PUBLIC_MCP_ENDPOINT: withPath(origins.mcp, '/mcp'),
    NEXT_PUBLIC_WS_ENDPOINT: origins.notifications,
    WEBSOCKET_URL: websocketOrigin(origins.notifications),
  };

  for (const key of APP_REDIRECT_KEYS) {
    const currentValue = existingEnv[key];
    if (currentValue) {
      environment[key] = replaceOrigin(currentValue, origins.app);
    }
  }

  return environment;
}
