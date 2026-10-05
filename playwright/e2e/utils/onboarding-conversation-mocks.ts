import {
  ONBOARDING_GREETING,
  ONBOARDING_URL_PROMPT,
  ONBOARDING_URL_TITLE,
} from '@genfeedai/contracts/constants';
import type { Page } from '@playwright/test';

interface ConversationMockOptions {
  organizationId: string;
  isExpert?: boolean;
  onComplete: () => void;
  onBrandComplete: () => void;
}

const QUESTIONS = {
  goals: [
    'Grow audience',
    'Drive sales',
    'Build authority',
    'Stay consistent',
    'Skip',
  ],
  platforms: ['X', 'LinkedIn', 'Instagram', 'TikTok / YouTube', 'Skip'],
  cadence: ['Daily', 'A few times a week', 'Weekly', 'Skip'],
  tone: [
    'Keep it as found',
    'More casual',
    'More professional',
    'Bolder',
    'Skip',
  ],
} as const;

const QUESTION_OPTION_IDS: Record<string, string> = {
  'TikTok / YouTube': 'short_video',
  'A few times a week': 'few_times_week',
  'Keep it as found': 'keep',
  'More casual': 'casual',
  'More professional': 'professional',
  Bolder: 'bold',
};

export async function setupOnboardingConversationMocks(
  page: Page,
  options: ConversationMockOptions,
) {
  const threadId = 'thread-conversation-e2e';
  let hasStarted = false;
  let stage = 'url';
  let sequence = 0;
  let runId: string | null = null;
  let uiActions: Array<Record<string, unknown>> = [];
  const responses: Array<Record<string, unknown>> = [];
  const messages: Array<Record<string, unknown>> = [
    {
      id: 'greeting',
      role: 'assistant',
      content: ONBOARDING_GREETING,
      createdAt: new Date().toISOString(),
      metadata: {},
    },
  ];
  const thread = {
    id: threadId,
    organizationId: options.organizationId,
    brandId: 'brand-1',
    contextVersion: 1,
    source: 'onboarding',
    status: 'active',
    mode: 'auto',
    title: ONBOARDING_URL_TITLE,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  function resource(item: Record<string, unknown>, type = 'thread') {
    return { id: String(item.id), type, attributes: item };
  }
  function pendingRequest() {
    const common = {
      requestId: `input-${sequence}`,
      createdAt: new Date().toISOString(),
      fieldId: stage,
      metadata: { brandId: 'brand-1', contextVersion: 1 },
    };
    if (stage === 'done') return [];
    if (stage === 'url')
      return [
        {
          ...common,
          title: ONBOARDING_URL_TITLE,
          prompt: ONBOARDING_URL_PROMPT,
          allowFreeText: true,
          options: [{ id: 'https://genfeed.ai', label: 'Use genfeed.ai' }],
        },
      ];
    if (stage === 'failed')
      return [
        {
          ...common,
          title: 'Could not read that link',
          prompt: 'Choose how to continue.',
          allowFreeText: false,
          options: [
            { id: 'try_another_link', label: 'Try another link' },
            {
              id: 'continue_without_website',
              label: 'Continue without a website',
            },
          ],
        },
      ];
    if (stage === 'confirm')
      return [
        {
          ...common,
          title: 'Check what I found',
          prompt: 'Does this look right?',
          allowFreeText: false,
          options: [
            { id: 'looks_right', label: 'Looks right' },
            { id: 'try_another_link', label: 'Try another link' },
            { id: 'skip', label: 'Skip' },
          ],
        },
      ];
    if (stage === 'handoff')
      return [
        {
          ...common,
          title: 'Your brand is ready',
          prompt: 'Choose your next step.',
          allowFreeText: false,
          options: [
            { id: 'create_first_post', label: 'Create my first post' },
            { id: 'workspace', label: 'Go to my workspace' },
          ],
        },
      ];
    const labels = QUESTIONS[stage as keyof typeof QUESTIONS];
    return [
      {
        ...common,
        title: stage,
        prompt: 'Choose what fits your brand.',
        allowFreeText: false,
        metadata: { ...common.metadata, submitImmediatelyOptionIds: ['skip'] },
        isMultiSelect: stage === 'goals' || stage === 'platforms',
        ...(stage === 'goals' || stage === 'platforms'
          ? { maxSelections: stage === 'goals' ? 3 : 4 }
          : {}),
        options: labels.map((label) => ({
          id:
            label === 'Skip'
              ? 'skip'
              : (QUESTION_OPTION_IDS[label] ??
                label.toLowerCase().replaceAll(' ', '_')),
          label,
        })),
      },
    ];
  }
  await page.route(/\/threads(?:\?.*)?$/, (route) =>
    route.fulfill({ json: { data: hasStarted ? [resource(thread)] : [] } }),
  );
  await page.route('**/threads/onboarding/kickoff', async (route) => {
    hasStarted = true;
    await route.fulfill({ json: { data: resource(thread) } });
  });
  await page.route(`**/threads/${threadId}`, (route) =>
    route.fulfill({ json: { data: resource(thread) } }),
  );
  await page.route(`**/threads/${threadId}/messages?*`, (route) =>
    route.fulfill({
      json: {
        data: messages.map((message) => resource(message, 'thread-message')),
      },
    }),
  );
  await page.route(`**/threads/${threadId}/snapshot`, (route) =>
    route.fulfill({
      json: {
        threadId,
        title: thread.title,
        source: 'onboarding',
        threadStatus: 'active',
        activeRun: runId ? { runId, status: 'completed' } : null,
        lastAssistantMessage: null,
        lastSequence: sequence,
        latestProposedPlan: null,
        latestUiBlocks: null,
        memorySummaryRefs: [],
        pendingApprovals: [],
        pendingInputRequests: pendingRequest(),
        profileSnapshot: null,
        sessionBinding: null,
        timeline: [],
      },
    }),
  );
  await page.route(
    `**/threads/${threadId}/input-requests/*/responses`,
    async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      responses.push(body);
      const answer = String(body.answer);
      const queuedAt = new Date().toISOString();
      let toolCalls: Array<Record<string, unknown>> = [];
      uiActions = [];
      if (stage === 'url') {
        const isFailed = answer.includes('blocked.example');
        stage = isFailed ? 'failed' : 'confirm';
        toolCalls = [
          {
            toolName: 'scan_brand_url',
            status: 'completed',
            creditsUsed: 0,
            durationMs: 10,
            result: { status: isFailed ? 'failed' : 'scanned' },
          },
        ];
        if (!isFailed)
          uiActions = [
            {
              id: `scan-${sequence}`,
              type: 'completion_summary_card',
              title: 'Genfeed',
              outcomeBullets: ['Tone: Friendly'],
              ctas: [],
            },
          ];
      } else if (stage === 'failed' || stage === 'confirm') {
        stage = answer === 'Try another link' ? 'url' : 'goals';
      } else if (stage === 'goals') stage = 'platforms';
      else if (stage === 'platforms') stage = 'cadence';
      else if (stage === 'cadence') stage = 'tone';
      else if (stage === 'tone') {
        stage = options.isExpert ? 'done' : 'handoff';
        toolCalls = [
          {
            toolName: 'save_onboarding_answers',
            status: 'completed',
            creditsUsed: 0,
            durationMs: 10,
          },
        ];
        if (options.isExpert) {
          options.onBrandComplete();
          toolCalls.push({
            toolName: 'complete_brand_onboarding_step',
            status: 'completed',
            creditsUsed: 0,
            durationMs: 10,
          });
          uiActions = [
            {
              id: 'expert-handoff',
              type: 'completion_summary_card',
              title: 'Your brand is ready',
              ctas: [{ label: 'Continue', href: '/onboarding/positioning' }],
            },
          ];
        }
      } else if (stage === 'handoff' && answer === 'Go to my workspace') {
        stage = 'done';
        options.onComplete();
        toolCalls = [
          {
            toolName: 'complete_onboarding',
            status: 'completed',
            creditsUsed: 0,
            durationMs: 10,
          },
        ];
      }
      if (stage !== 'done')
        toolCalls.push({
          toolName: 'request_input',
          status: 'completed',
          creditsUsed: 0,
          durationMs: 1,
        });
      sequence += 1;
      runId = `conversation-run-${sequence}`;
      messages.push({
        id: `reply-${sequence}`,
        role: 'assistant',
        content:
          stage === 'failed'
            ? 'I could not read that link. We can use another link or continue.'
            : 'Let’s keep going.',
        createdAt: queuedAt,
        toolCalls,
        metadata: { runId, toolCalls, uiActions },
      });
      await route.fulfill({
        json: {
          answer,
          executionId: runId,
          queuedAt,
          requestId: `input-${sequence - 1}`,
          resolvedAt: queuedAt,
          status: 'resolved',
          threadId,
        },
      });
    },
  );
  return { responses, threadId };
}
