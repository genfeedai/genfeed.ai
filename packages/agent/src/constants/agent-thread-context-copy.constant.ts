/**
 * Single source of truth for the agent Context rail's own copy.
 * Mirrors the shell's `WORKSPACE_INSPECTOR_CHROME` pattern — the rail body
 * lives in `packages/agent`, so it cannot read the app-side constant.
 */
export const AGENT_THREAD_CONTEXT_COPY = {
  eyebrow: 'Context',
  subtitle: 'What the agent is working with right now.',
  untitledThread: 'This conversation',
  brandSection: 'Brand',
  brandActive: 'Active',
  brandCompleteness: 'Context filled',
  brandEmpty:
    'No brand selected. The agent writes generically until one is chosen.',
  brandManage: 'Manage',
  brandSetUp: 'Set up',
  channelsSection: 'Channels',
  channelsEmpty:
    'No channels connected. Publishing stays unavailable until one is.',
  channelsManage: 'Manage',
  channelsConnect: 'Connect',
  conversationSection: 'Conversation',
  conversationMessages: 'Messages',
  conversationModel: 'Model',
  conversationStarted: 'Started',
  conversationLastActivity: 'Last activity',
  destinationsSection: 'Go to',
  untitledBrand: 'Untitled',
} as const;
