/** Canonical product names shown in app-level navigation and page chrome. */
export const APP_DISPLAY_LABELS = Object.freeze({
  admin: 'Admin',
  agent: 'Agent',
  analytics: 'Analytics',
  automation: 'Automation',
  clips: 'Clips',
  discovery: 'Discovery',
  editor: 'Editor',
  library: 'Library',
  messages: 'Messages',
  motion: 'Motion',
  playground: 'Playground',
  publishing: 'Publishing',
  storyboard: 'Storyboard',
  turbo: 'Turbo',
  workspace: 'Workspace',
} as const);

export type AppDisplayId = keyof typeof APP_DISPLAY_LABELS;
