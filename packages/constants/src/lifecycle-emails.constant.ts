import { APP_ROUTES } from './routes.constant';

export type LifecycleSystemEmailSequence =
  | 'welcome'
  | 'activation-nudge'
  | 'abandoned-checkout'
  | 'win-back';

export type LifecycleSystemEmailStep =
  | 'welcome-day-0'
  | 'welcome-day-2'
  | 'welcome-day-7'
  | 'activation-nudge'
  | 'checkout-recovery'
  | 'win-back';

export type LifecycleSystemEmailVisibility = 'admin-only';

export type LifecycleSystemEmailAction =
  | {
      type: 'app-root';
      label: string;
    }
  | {
      type: 'app-path';
      label: string;
      path: string;
    }
  | {
      type: 'checkout-or-app-root';
      label: string;
      fallbackLabel: string;
    };

export interface LifecycleSystemEmailDefinition {
  id: LifecycleSystemEmailStep;
  systemWorkflowId: string;
  visibility: LifecycleSystemEmailVisibility;
  sequence: LifecycleSystemEmailSequence;
  step: LifecycleSystemEmailStep;
  name: string;
  trigger: string;
  schedule: string;
  audience: string;
  subject: string;
  title: string;
  preheader: string;
  action: LifecycleSystemEmailAction;
  paragraphs: readonly string[];
  skipRules: readonly string[];
}

export interface LifecycleSystemEmailResolvedAction {
  label: string;
  url: string;
}

const GREETING_TOKEN = '{{greeting}}';
const DEFAULT_APP_URL = 'https://app.genfeed.ai';

const DEFAULT_SKIP_RULES = [
  'Self-hosted deployments do not send lifecycle marketing email.',
  'Recipient is missing, deleted, or unsubscribed from lifecycle email.',
] as const;

export const LIFECYCLE_SYSTEM_EMAILS = [
  {
    action: {
      label: 'Start onboarding',
      path: APP_ROUTES.ONBOARDING.ROOT,
      type: 'app-path',
    },
    audience: 'New cloud signups',
    id: 'welcome-day-0',
    name: 'Welcome day 0',
    paragraphs: [
      `${GREETING_TOKEN}, welcome to Genfeed.ai.`,
      'The fastest path is simple: set up your brand, connect one channel, and publish one useful piece of content.',
      'Your workspace is ready when you are.',
    ],
    preheader: 'Start your Genfeed.ai onboarding path.',
    schedule: 'Immediately after signup',
    sequence: 'welcome',
    skipRules: DEFAULT_SKIP_RULES,
    step: 'welcome-day-0',
    subject: 'Welcome to Genfeed.ai',
    systemWorkflowId: 'system.lifecycle-email.welcome-day-0',
    title: 'Your Genfeed workspace is ready',
    trigger: 'User signs up',
    visibility: 'admin-only',
  },
  {
    action: {
      label: 'Continue setup',
      path: APP_ROUTES.ONBOARDING.PROVIDERS,
      type: 'app-path',
    },
    audience: 'New cloud signups',
    id: 'welcome-day-2',
    name: 'Welcome day 2',
    paragraphs: [
      `${GREETING_TOKEN}, a connected channel turns Genfeed from a workspace into a publishing loop.`,
      'Connect one destination and Genfeed can help you draft, review, and publish from the same place.',
    ],
    preheader: 'Connect one channel to keep setup moving.',
    schedule: '2 days after signup',
    sequence: 'welcome',
    skipRules: DEFAULT_SKIP_RULES,
    step: 'welcome-day-2',
    subject: 'Connect your first Genfeed channel',
    systemWorkflowId: 'system.lifecycle-email.welcome-day-2',
    title: 'Keep your setup moving',
    trigger: 'User signs up',
    visibility: 'admin-only',
  },
  {
    action: { label: 'Open Genfeed', type: 'app-root' },
    audience: 'New cloud signups',
    id: 'welcome-day-7',
    name: 'Welcome day 7',
    paragraphs: [
      `${GREETING_TOKEN}, your first week is about finding the repeatable content motion that fits your brand.`,
      'Open your workspace when you are ready to turn an idea into a scheduled post.',
    ],
    preheader: 'Turn one idea into a scheduled post.',
    schedule: '7 days after signup',
    sequence: 'welcome',
    skipRules: DEFAULT_SKIP_RULES,
    step: 'welcome-day-7',
    subject: 'Ready to build your first content loop?',
    systemWorkflowId: 'system.lifecycle-email.welcome-day-7',
    title: 'Build your first content loop',
    trigger: 'User signs up',
    visibility: 'admin-only',
  },
  {
    action: {
      label: 'Publish first post',
      path: APP_ROUTES.ONBOARDING.ROOT,
      type: 'app-path',
    },
    audience: 'Signed-up users without a public post',
    id: 'activation-nudge',
    name: 'Activation nudge',
    paragraphs: [
      `${GREETING_TOKEN}, your account is set up but has not reached the first publish milestone yet.`,
      'Pick one idea, let Genfeed shape the draft, and publish it to complete activation.',
    ],
    preheader: 'Publish once to complete activation.',
    schedule: '3 days after signup',
    sequence: 'activation-nudge',
    skipRules: [...DEFAULT_SKIP_RULES, 'User already has a public post.'],
    step: 'activation-nudge',
    subject: 'Publish your first Genfeed post',
    systemWorkflowId: 'system.lifecycle-email.activation-nudge',
    title: 'One publish completes activation',
    trigger: 'User signs up and has not published a public post',
    visibility: 'admin-only',
  },
  {
    action: {
      fallbackLabel: 'Open Genfeed',
      label: 'Return to checkout',
      type: 'checkout-or-app-root',
    },
    audience: 'Users with an incomplete checkout session',
    id: 'checkout-recovery',
    name: 'Checkout recovery',
    paragraphs: [
      `${GREETING_TOKEN}, your checkout did not complete.`,
      'You can return when you are ready and continue from the same Genfeed account.',
    ],
    preheader: 'Return to your Genfeed checkout when ready.',
    schedule: '1 day after checkout starts',
    sequence: 'abandoned-checkout',
    skipRules: [
      ...DEFAULT_SKIP_RULES,
      'Checkout completed before the recovery email sends.',
    ],
    step: 'checkout-recovery',
    subject: 'Finish setting up Genfeed',
    systemWorkflowId: 'system.lifecycle-email.checkout-recovery',
    title: 'Your checkout is still waiting',
    trigger: 'Checkout starts and remains incomplete',
    visibility: 'admin-only',
  },
  {
    action: {
      label: 'Open billing',
      path: APP_ROUTES.SETTINGS.BILLING,
      type: 'app-path',
    },
    audience: 'Users with a lapsed Genfeed subscription',
    id: 'win-back',
    name: 'Win-back',
    paragraphs: [
      `${GREETING_TOKEN}, your Genfeed subscription has lapsed.`,
      'Your workspace remains focused on helping you keep a consistent content system. You can restart when the timing is right.',
    ],
    preheader: 'Restart your Genfeed workspace when ready.',
    schedule: '7 days after subscription lapses',
    sequence: 'win-back',
    skipRules: [
      ...DEFAULT_SKIP_RULES,
      'User already has an active or trialing subscription.',
    ],
    step: 'win-back',
    subject: 'Restart your Genfeed content system',
    systemWorkflowId: 'system.lifecycle-email.win-back',
    title: 'Your workspace is ready when you return',
    trigger: 'Subscription enters a lapsed state',
    visibility: 'admin-only',
  },
] as const satisfies readonly LifecycleSystemEmailDefinition[];

export function getLifecycleSystemEmailDefinition(
  step: string,
): LifecycleSystemEmailDefinition | undefined {
  return LIFECYCLE_SYSTEM_EMAILS.find((email) => email.step === step);
}

export function renderLifecycleSystemEmailParagraphs(
  definition: Pick<LifecycleSystemEmailDefinition, 'paragraphs'>,
  greeting: string,
): string[] {
  return definition.paragraphs.map((paragraph) =>
    paragraph.replace(GREETING_TOKEN, greeting),
  );
}

export function buildLifecycleSystemEmailAction(
  definition: Pick<LifecycleSystemEmailDefinition, 'action'>,
  appUrl: string = DEFAULT_APP_URL,
  checkoutUrl?: string,
): LifecycleSystemEmailResolvedAction {
  const normalizedAppUrl = stripTrailingSlash(appUrl || DEFAULT_APP_URL);

  switch (definition.action.type) {
    case 'app-path':
      return {
        label: definition.action.label,
        url: `${normalizedAppUrl}${definition.action.path}`,
      };
    case 'checkout-or-app-root':
      return checkoutUrl
        ? { label: definition.action.label, url: checkoutUrl }
        : { label: definition.action.fallbackLabel, url: normalizedAppUrl };
    default:
      return {
        label: definition.action.label,
        url: normalizedAppUrl,
      };
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
