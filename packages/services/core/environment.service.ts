import { MODEL_KEYS } from '@genfeedai/constants';

const DEFAULT_IMAGE_MODEL = MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA;
const DEFAULT_VIDEO_MODEL = MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1;

type DesktopEnvironmentOverrides = Partial<{
  apiEndpoint: string;
  appEndpoint: string;
  appName: 'desktop';
  authEndpoint: string;
  cdnUrl: string;
  websiteEndpoint: string;
  wsEndpoint: string;
}>;

declare global {
  var __GENFEED_DESKTOP_ENV__: DesktopEnvironmentOverrides | undefined;
}

const getDesktopEnvironmentOverrides = (): DesktopEnvironmentOverrides => {
  if (typeof globalThis === 'undefined') {
    return {};
  }

  return globalThis.__GENFEED_DESKTOP_ENV__ ?? {};
};

export const EnvironmentService = {
  get apiEndpoint(): string {
    return (
      getDesktopEnvironmentOverrides().apiEndpoint ||
      process.env.NEXT_PUBLIC_API_ENDPOINT ||
      'https://api.genfeed.ai/v1'
    );
  },

  apps: {
    admin:
      process.env.NEXT_PUBLIC_APPS_ADMIN_ENDPOINT || 'https://admin.genfeed.ai',
    get app() {
      return (
        getDesktopEnvironmentOverrides().appEndpoint ||
        process.env.NEXT_PUBLIC_APPS_APP_ENDPOINT ||
        'https://app.genfeed.ai'
      );
    },
    marketplace:
      process.env.NEXT_PUBLIC_APPS_MARKETPLACE_ENDPOINT ||
      'https://marketplace.genfeed.ai',
    website:
      getDesktopEnvironmentOverrides().websiteEndpoint ||
      process.env.NEXT_PUBLIC_APPS_WEBSITE_ENDPOINT ||
      'https://genfeed.ai',
  },

  get assetsEndpoint(): string {
    if (this.isDevelopment) {
      return 'https://cdn.genfeed.ai/assets';
    }
    return `${this.cdnUrl}/assets`;
  },
  CREDITS_LABEL: 'GEN',
  CREDITS_TRAINING_COST: 500,

  calendly: 'https://calendly.com/vincent-genfeed/30min',

  get cdnUrl(): string {
    return (
      getDesktopEnvironmentOverrides().cdnUrl ||
      process.env.NEXT_PUBLIC_CDN_URL ||
      'https://cdn.genfeed.ai'
    );
  },

  /**
   * Get the current app name based on the hostname
   * Returns null if running in development or unknown app
   */
  get currentApp(): 'admin' | 'app' | 'marketplace' | 'website' | null {
    const desktopAppName = getDesktopEnvironmentOverrides().appName;

    if (desktopAppName === 'desktop') {
      return 'app';
    }

    if (typeof window === 'undefined') {
      return null;
    }

    const hostname = window.location.hostname;

    if (hostname.includes('app.genfeed.ai')) {
      return 'app';
    }
    if (hostname.includes('marketplace.genfeed.ai')) {
      return 'marketplace';
    }
    if (hostname === 'genfeed.ai' || hostname === 'www.genfeed.ai') {
      return 'website';
    }

    // For local development, detect from port
    if (hostname.includes('local.genfeed.ai')) {
      const port = window.location.port;

      if (port === '3000') {
        return 'app';
      }
      if (port === '3003') {
        return 'marketplace';
      }
      if (port === '3002') {
        return 'website';
      }
    }

    return null;
  },

  /**
   * Get the current theme preference from the theme cookie
   * @returns 'light' or 'dark', defaults to 'dark' if cookie not found
   */
  get currentTheme(): 'light' | 'dark' {
    if (typeof document === 'undefined') {
      return 'dark';
    }

    const themeCookie = document.cookie
      .split('; ')
      .find((row) => row.startsWith('theme='));

    const theme = themeCookie?.split('=')[1];

    return theme === 'light' ? 'light' : 'dark';
  },

  // Feature flags
  ENABLE_SUBSCRIPTIONS: true,

  GA_ID: process.env.NEXT_PUBLIC_GA_ID || '',

  getApiUrl(): string {
    return this.apiEndpoint;
  },

  github: {
    core:
      process.env.NEXT_PUBLIC_GITHUB_CORE ||
      'https://github.com/genfeedai/core',
    issues:
      process.env.NEXT_PUBLIC_GITHUB_ISSUES ||
      'https://github.com/genfeedai/core/issues',
    org: process.env.NEXT_PUBLIC_GITHUB_ORG || 'https://github.com/genfeedai',
    prs:
      process.env.NEXT_PUBLIC_GITHUB_PRS ||
      'https://github.com/genfeedai/core/pulls',
  },

  get ingredientsEndpoint(): string {
    return `${this.cdnUrl}/ingredients`;
  },

  get isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
  },

  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },

  get isTest(): boolean {
    return process.env.NODE_ENV === 'test';
  },

  JWT_LABEL: process.env.NEXT_PUBLIC_JWT_LABEL || 'genfeed-jwt',

  LOGO_ALT: 'Genfeed.ai',

  get logoURL(): string {
    return `${this.assetsEndpoint}/branding/logo.svg`;
  },

  get MODELS_DEFAULT(): { image: string; video: string } {
    return {
      image: this.isDevelopment
        ? MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3
        : DEFAULT_IMAGE_MODEL,
      video: this.isDevelopment
        ? MODEL_KEYS.REPLICATE_GOOGLE_VEO_2
        : DEFAULT_VIDEO_MODEL,
    };
  },

  /**
   * Stripe price IDs for subscription tiers
   * See: https://github.com/genfeedai/cloud/issues?q=is%3Aissue+pricing
   */
  plans: {
    enterprise:
      process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY, // Enterprise $4,999/mo
    // New output-based tiers (2026)
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY, // Pro $499/mo
    // PAYG one-time credits
    payg: process.env.NEXT_PUBLIC_STRIPE_PRICE_PAYG,
    scale: process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY, // Scale $1,499/mo
    yearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY,
  },

  setDesktopOverrides(overrides: DesktopEnvironmentOverrides): void {
    if (typeof globalThis === 'undefined') {
      return;
    }

    globalThis.__GENFEED_DESKTOP_ENV__ = {
      ...getDesktopEnvironmentOverrides(),
      ...overrides,
    };
  },

  social: {
    discord:
      process.env.NEXT_PUBLIC_SOCIAL_DISCORD || 'https://discord.gg/Qy867n83Z4',
    facebook:
      process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK ||
      'https://facebook.com/genfeedai',
    instagram:
      process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM ||
      'https://instagram.com/genfeedai',
    linkedin:
      process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN ||
      'https://linkedin.com/company/genfeedai',
    substack:
      process.env.NEXT_PUBLIC_SOCIAL_SUBSTACK ||
      'https://genfeedai.substack.com',
    tiktok:
      process.env.NEXT_PUBLIC_SOCIAL_TIKTOK || 'https://tiktok.com/@genfeedai',
    twitter:
      process.env.NEXT_PUBLIC_SOCIAL_TWITTER || 'https://x.com/genfeedai',
    youtube:
      process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE ||
      'https://youtube.com/@genfeedai',
  },

  /**
   * Stripe publishable key for client-side Elements / Setup Intents
   */
  get stripePublishableKey(): string {
    return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  },
  TEXT_MODEL_DEFAULT_COST: Number(process.env.NEXT_PUBLIC_TEXT_MODEL_COST || 3),
  USE_PRESIGNED_URLS: true,

  get wsEndpoint(): string {
    return (
      getDesktopEnvironmentOverrides().wsEndpoint ||
      process.env.NEXT_PUBLIC_WS_ENDPOINT ||
      'https://notifications.genfeed.ai'
    );
  },
} as const;
