/** Canonical product names shown in app-level navigation and page chrome. */
export const APP_DISPLAY_LABELS = Object.freeze({
  admin: 'Admin',
  agent: 'Agent',
  analytics: 'Analytics',
  automate: 'Automation',
  discover: 'Discovery',
  library: 'Library',
  messages: 'Messages',
  publish: 'Publishing',
  studio: 'Studio',
  workspace: 'Workspace',
} as const);

export type AppDisplayId = keyof typeof APP_DISPLAY_LABELS;
