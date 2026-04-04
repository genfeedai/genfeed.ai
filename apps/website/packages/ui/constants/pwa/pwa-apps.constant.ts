import type {
  PWAAppConfig,
  PWAAppNameKey,
} from '@genfeedai/interfaces/pwa/pwa.interface';

const PWA_THEME_DEFAULTS = {
  backgroundColor: '#1a1a2e',
  scope: '/',
  themeColorDark: '#1a1a2e',
  themeColorLight: '#ffffff',
} as const;

function createPWAConfig(
  appName: PWAAppNameKey,
  shortName: string,
  description: string,
  startUrl = '/',
): PWAAppConfig {
  return {
    ...PWA_THEME_DEFAULTS,
    appName,
    description,
    displayName: `Genfeed ${shortName}`,
    shortName,
    startUrl,
  };
}

export const PWA_APPS: Record<PWAAppNameKey, PWAAppConfig> = {
  analytics: createPWAConfig(
    'analytics',
    'Analytics',
    'Track performance and insights for your content',
  ),
  app: createPWAConfig(
    'app',
    'Content Hub',
    'AI-powered content management hub for your content lifecycle',
    '/overview',
  ),
  automation: createPWAConfig(
    'automation',
    'Automation',
    'Automate content workflows with AI agents',
  ),
  dashboard: createPWAConfig(
    'dashboard',
    'Dashboard',
    'Overview of your Genfeed AI workspace',
  ),
  manager: createPWAConfig(
    'manager',
    'Manager',
    'Manage your AI-generated content library and assets',
    '/overview',
  ),
  marketplace: createPWAConfig(
    'marketplace',
    'Marketplace',
    'Creator marketplace for workflows, prompts, and digital products',
  ),
  publisher: createPWAConfig(
    'publisher',
    'Publisher',
    'Schedule and publish content across social platforms',
  ),
  settings: createPWAConfig(
    'settings',
    'Settings',
    'Configure your Genfeed account and preferences',
  ),
  studio: createPWAConfig(
    'studio',
    'Studio',
    'AI-powered content creation studio for videos and images',
    '/overview',
  ),
  workflows: createPWAConfig(
    'workflows',
    'Workflows',
    'Visual workflow builder for AI content automation',
    '/overview',
  ),
};

export const PWA_APP_NAMES = Object.keys(PWA_APPS) as PWAAppNameKey[];
