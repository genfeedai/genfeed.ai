import { UiActionRenderer } from '@genfeedai/agent/components/UiActionRenderer';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    usePromptModal: () => ({ openPromptModal: vi.fn() }),
  }),
);

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/data/content/use-posting-sets/use-posting-sets', () => ({
  usePostingSets: () => ({
    createSet: vi.fn(),
    expandError: null,
    expandSet: vi.fn(),
    isExpanding: false,
    isLoading: false,
    isSaving: false,
    saveError: null,
    sets: [],
  }),
}));

vi.mock(
  '@hooks/data/content/use-posting-signatures/use-posting-signatures',
  () => ({
    usePostingSignatures: () => ({
      isLoading: false,
      signatures: [],
    }),
  }),
);

function makeAction(
  type: string,
  extra: Partial<AgentUiAction> = {},
): AgentUiAction {
  return {
    description: 'Card description',
    id: `${type}-1`,
    title: `Card ${type}`,
    type,
    ...extra,
  } as AgentUiAction;
}

/**
 * Card types that render standalone (no apiService requirement) with minimal
 * action payloads. Rendering each covers the renderer's dispatch table.
 */
const STANDALONE_CASES: Array<[string, Partial<AgentUiAction>]> = [
  ['completion_summary_card', { summaryText: 'Done!' }],
  ['oauth_connect_card', { platform: 'instagram' }],
  ['content_preview_card', { content: 'Preview body' }],
  [
    'payment_cta_card',
    { packs: [{ credits: 100, label: 'Starter', price: '$5' }] },
  ],
  ['analytics_snapshot_card', { metrics: [] }],
  ['ads_search_results_card', { items: [] }],
  ['ad_detail_summary_card', {}],
  ['campaign_launch_prep_card', {}],
  ['publish_post_card', {}],
  [
    'image_transform_card',
    {
      ctas: [
        { href: '/images/1/upscale', label: 'Upscale' },
        { href: '/images/1/enhance', label: 'Enhance' },
      ],
      images: ['https://cdn.test/preview.png'],
    },
  ],
  [
    'outreach_sequence_create_card',
    { ctas: [{ href: '/messages/outreach/new', label: 'Create' }] },
  ],
  ['outreach_sequence_control_card', { status: 'paused' }],
  ['review_gate_card', { items: [] }],
  ['ingredient_picker_card', { ingredients: [] }],
  ['schedule_post_card', {}],
  ['engagement_opportunity_card', {}],
  ['onboarding_checklist_card', {}],
  ['credits_balance_card', { balance: 120, usagePercent: 40 }],
  ['studio_handoff_card', { editorType: 'Video', studioUrl: '/studio/1' }],
  ['trending_topics_card', { trends: [{ change: 12, topic: 'AI video' }] }],
  ['content_calendar_card', { calendarDays: [] }],
  ['batch_generation_card', {}],
  ['batch_generation_result_card', { results: [] }],
  ['brand_voice_profile_card', {}],
  ['workflow_created_card', {}],
  ['bot_created_card', { botName: 'Bot' }],
  ['livestream_bot_status_card', { sessionStatus: 'running' }],
  ['brand_interview_offer_card', {}],
  ['brand_interview_complete_card', {}],
  [
    'agent_transfer_card',
    { data: { content: 'Handoff', direction: 'outbound', status: 'PENDING' } },
  ],
  ['ai_text_action_card', { textContent: 'text' }],
];

/** Cards that mutate through apiService must render null without one. */
const API_SERVICE_GATED_TYPES = [
  'generation_action_card',
  'workflow_trigger_card',
  'clip_workflow_run_card',
  'ingredient_alternatives_card',
  'workflow_execute_card',
  'voice_clone_card',
];

describe('UiActionRenderer dispatch matrix', () => {
  it.each(STANDALONE_CASES)('renders %s', (type, extra) => {
    const { container } = render(
      <UiActionRenderer action={makeAction(type, extra)} />,
    );

    expect(container.firstChild).not.toBeNull();
  });

  it.each(API_SERVICE_GATED_TYPES)(
    'renders nothing for %s without an apiService',
    (type) => {
      const { container } = render(
        <UiActionRenderer action={makeAction(type)} />,
      );

      expect(container.firstChild).toBeNull();
    },
  );

  it('renders a diagnostic fallback for unknown card types', () => {
    const { getByRole } = render(
      <UiActionRenderer action={makeAction('mystery_card')} />,
    );

    expect(getByRole('status').textContent).toContain(
      'This card type is not supported yet',
    );
    expect(getByRole('status').textContent).toContain('mystery_card');
  });

  it('renders nothing for clip_run_card without run state', () => {
    const { container } = render(
      <UiActionRenderer action={makeAction('clip_run_card')} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('wraps read-only standalone cards in an inert shell', () => {
    const { getByTestId } = render(
      <UiActionRenderer action={makeAction('schedule_post_card')} isReadOnly />,
    );

    expect(getByTestId('ui-action-archived-readonly')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('forwards ai text apply events through onUiAction', () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const { getByRole } = render(
      <UiActionRenderer
        action={makeAction('ai_text_action_card', { textContent: 'body' })}
        onUiAction={(name, payload) => {
          calls.push([name, payload]);
        }}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Enhance' }));
    fireEvent.click(getByRole('button', { name: 'Apply' }));

    expect(calls).toEqual([
      ['apply_to_draft', { sourceAction: 'Enhance', text: 'body' }],
    ]);
  });
});
