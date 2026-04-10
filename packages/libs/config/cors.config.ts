/**
 * Shared CORS configuration for all Genfeed.ai services
 *
 * This centralizes CORS origin patterns across API, Notifications, Files, and MCP services
 * to ensure consistent security policies and easier maintenance.
 */

export interface CorsOriginConfig {
  /**
   * Whether the service is running in development mode
   */
  isDevelopment: boolean;

  /**
   * Optional: Chrome extension ID for production
   * If provided, will allow only this specific extension ID
   * If not provided, no extension access in production (fail secure)
   */
  chromeExtensionId?: string;

  /**
   * Optional: Additional origins to include beyond the standard Genfeed.ai domains
   * Useful for service-specific origins (e.g., MCP service needs ChatGPT domains)
   */
  additionalOrigins?: (string | RegExp)[];
}

/**
 * Get CORS origins configuration for Genfeed.ai services
 *
 * @param config - Configuration object with environment settings
 * @returns Array of allowed CORS origins (strings and RegExp patterns)
 *
 * @example
 * ```typescript
 * app.enableCors({
 *   credentials: true,
 *   methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
 *   origin: getGenfeedCorsOrigins({
 *     isDevelopment: process.env.NODE_ENV === 'development',
 *     chromeExtensionId: process.env.CHROME_EXTENSION_ID,
 *   }),
 * });
 * ```
 */
export function getGenfeedCorsOrigins(
  config: CorsOriginConfig,
): (string | RegExp)[] {
  const { isDevelopment, chromeExtensionId, additionalOrigins = [] } = config;

  if (isDevelopment) {
    return [
      // Local development domains (ports 3000-3999: web apps and local services)
      /^http:\/\/(localhost|local\.genfeed\.ai):(3\d{3})$/,

      // Allow Chrome extensions in development
      /^chrome-extension:\/\/.*$/,

      // ChatGPT GPT Actions
      'https://chat.openai.com',
      'https://chatgpt.com',
      ...additionalOrigins,
    ];
  }

  // Production origins
  const productionOrigins: (string | RegExp)[] = [
    // Main domain
    /^https:\/\/genfeed\.ai$/,

    // All subdomains

    /^https:\/\/(admin|app|chatgpt|docs|login|marketplace|website)\.genfeed\.ai$/,

    // ChatGPT GPT Actions
    'https://chat.openai.com',
    'https://chatgpt.com',
  ];

  // Chrome Extension CORS
  if (chromeExtensionId) {
    // Production with extension ID = allow specific extension only
    productionOrigins.push(`chrome-extension://${chromeExtensionId}`);
  }
  // Production without ID = no extension access (fail secure)

  return [...productionOrigins, ...additionalOrigins];
}

/**
 * Standard subdomain list for documentation and reference
 *
 * This list is maintained here as a single source of truth for all
 * Genfeed.ai subdomains that should have API access.
 */
export const GENFEED_SUBDOMAINS = [
  'admin',
  'app',
  'chatgpt',
  'docs',
  'login',
  'marketplace',
  'website',
] as const;
