import { UiActionRenderer } from '@genfeedai/agent/components/UiActionRenderer';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const cardPropsSpies = vi.hoisted(() => ({
  aiTextAction: vi.fn(),
  brandCreate: vi.fn(),
  brandIdentityConfirmation: vi.fn(),
  brandInterviewOffer: vi.fn(),
  brandVoiceProfile: vi.fn(),
  clipWorkflowRun: vi.fn(),
  completionSummary: vi.fn(),
  contentPreview: vi.fn(),
  generationAction: vi.fn(),
  ingredientAlternatives: vi.fn(),
  ingredientPicker: vi.fn(),
  livestreamBot: vi.fn(),
  oauthConnect: vi.fn(),
  paymentCta: vi.fn(),
  publishPost: vi.fn(),
  schedulePost: vi.fn(),
  voiceClone: vi.fn(),
  workflowCreated: vi.fn(),
  workflowExecute: vi.fn(),
  workflowTrigger: vi.fn(),
}));

vi.mock('@genfeedai/agent/components/AgentCompletionSummaryCard', () => ({
  AgentCompletionSummaryCard: (props: Record<string, unknown>) => {
    cardPropsSpies.completionSummary(props);
    return <div data-testid="completion-summary-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/AgentChatMessageCards', () => ({
  ContentPreviewCard: (props: Record<string, unknown>) => {
    cardPropsSpies.contentPreview(props);
    return <div data-testid="content-preview-card" />;
  },
  OAuthConnectCard: (props: Record<string, unknown>) => {
    cardPropsSpies.oauthConnect(props);
    return <div data-testid="oauth-connect-card" />;
  },
  PaymentCtaCard: (props: Record<string, unknown>) => {
    cardPropsSpies.paymentCta(props);
    return <div data-testid="payment-cta-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/AiTextActionCard', () => ({
  AiTextActionCard: (props: Record<string, unknown>) => {
    cardPropsSpies.aiTextAction(props);
    return <div data-testid="ai-text-action-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/BrandCreateCard', () => ({
  BrandCreateCard: (props: Record<string, unknown>) => {
    cardPropsSpies.brandCreate(props);
    return <div data-testid="brand-create-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/BrandIdentityConfirmationCard', () => ({
  BrandIdentityConfirmationCard: (props: Record<string, unknown>) => {
    cardPropsSpies.brandIdentityConfirmation(props);
    return <div data-testid="brand-identity-confirmation-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/BrandInterviewOfferCard', () => ({
  BrandInterviewOfferCard: (props: Record<string, unknown>) => {
    cardPropsSpies.brandInterviewOffer(props);
    return <div data-testid="brand-interview-offer-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/BrandVoiceProfileCard', () => ({
  BrandVoiceProfileCard: (props: Record<string, unknown>) => {
    cardPropsSpies.brandVoiceProfile(props);
    return <div data-testid="brand-voice-profile-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/ClipWorkflowRunCard', () => ({
  ClipWorkflowRunCard: (props: Record<string, unknown>) => {
    cardPropsSpies.clipWorkflowRun(props);
    return <div data-testid="clip-workflow-run-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/GenerationActionCard', () => ({
  GenerationActionCard: (props: Record<string, unknown>) => {
    cardPropsSpies.generationAction(props);
    return <div data-testid="generation-action-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/IngredientAlternativesCard', () => ({
  IngredientAlternativesCard: (props: Record<string, unknown>) => {
    cardPropsSpies.ingredientAlternatives(props);
    return <div data-testid="ingredient-alternatives-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/IngredientPickerCard', () => ({
  IngredientPickerCard: (props: Record<string, unknown>) => {
    cardPropsSpies.ingredientPicker(props);
    return <div data-testid="ingredient-picker-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/LivestreamBotCard', () => ({
  LivestreamBotCard: (props: Record<string, unknown>) => {
    cardPropsSpies.livestreamBot(props);
    return <div data-testid="livestream-bot-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/PublishPostCard', () => ({
  PublishPostCard: (props: Record<string, unknown>) => {
    cardPropsSpies.publishPost(props);
    return <div data-testid="publish-post-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/SchedulePostCard', () => ({
  SchedulePostCard: (props: Record<string, unknown>) => {
    cardPropsSpies.schedulePost(props);
    return <div data-testid="schedule-post-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/VoiceCloneCard', () => ({
  VoiceCloneCard: (props: Record<string, unknown>) => {
    cardPropsSpies.voiceClone(props);
    return <div data-testid="voice-clone-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/WorkflowCreatedCard', () => ({
  WorkflowCreatedCard: (props: Record<string, unknown>) => {
    cardPropsSpies.workflowCreated(props);
    return <div data-testid="workflow-created-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/WorkflowExecuteCard', () => ({
  WorkflowExecuteCard: (props: Record<string, unknown>) => {
    cardPropsSpies.workflowExecute(props);
    return <div data-testid="workflow-execute-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/WorkflowTriggerCard', () => ({
  WorkflowTriggerCard: (props: Record<string, unknown>) => {
    cardPropsSpies.workflowTrigger(props);
    return <div data-testid="workflow-trigger-card" />;
  },
}));

type RendererHandlerName =
  | 'onBrandCreate'
  | 'onCopy'
  | 'onOAuthConnect'
  | 'onRetry'
  | 'onSelectCreditPack'
  | 'onSelectIngredient'
  | 'onUiAction';

type HandlerExpectation = {
  cardProp: string;
  rendererHandler: RendererHandlerName;
  wrapsHandler?: boolean;
};

const handlerDrivenCases = [
  {
    actionType: 'completion_summary_card',
    expectations: [
      { cardProp: 'onCopy', rendererHandler: 'onCopy' },
      { cardProp: 'onRetry', rendererHandler: 'onRetry' },
      { cardProp: 'onUiAction', rendererHandler: 'onUiAction' },
    ],
    spy: cardPropsSpies.completionSummary,
    testId: 'completion-summary-card',
  },
  {
    actionType: 'oauth_connect_card',
    expectations: [
      { cardProp: 'onConnect', rendererHandler: 'onOAuthConnect' },
    ],
    spy: cardPropsSpies.oauthConnect,
    testId: 'oauth-connect-card',
  },
  {
    actionType: 'content_preview_card',
    expectations: [{ cardProp: 'onCopy', rendererHandler: 'onCopy' }],
    spy: cardPropsSpies.contentPreview,
    testId: 'content-preview-card',
  },
  {
    actionType: 'payment_cta_card',
    expectations: [
      { cardProp: 'onSelect', rendererHandler: 'onSelectCreditPack' },
    ],
    spy: cardPropsSpies.paymentCta,
    testId: 'payment-cta-card',
  },
  {
    actionType: 'publish_post_card',
    expectations: [{ cardProp: 'onUiAction', rendererHandler: 'onUiAction' }],
    spy: cardPropsSpies.publishPost,
    testId: 'publish-post-card',
  },
  {
    actionType: 'schedule_post_card',
    expectations: [{ cardProp: 'onUiAction', rendererHandler: 'onUiAction' }],
    spy: cardPropsSpies.schedulePost,
    testId: 'schedule-post-card',
  },
  {
    actionType: 'ingredient_picker_card',
    expectations: [
      { cardProp: 'onSelect', rendererHandler: 'onSelectIngredient' },
    ],
    spy: cardPropsSpies.ingredientPicker,
    testId: 'ingredient-picker-card',
  },
  {
    actionType: 'brand_create_card',
    expectations: [{ cardProp: 'onCreate', rendererHandler: 'onBrandCreate' }],
    spy: cardPropsSpies.brandCreate,
    testId: 'brand-create-card',
  },
  {
    actionType: 'brand_voice_profile_card',
    expectations: [{ cardProp: 'onUiAction', rendererHandler: 'onUiAction' }],
    spy: cardPropsSpies.brandVoiceProfile,
    testId: 'brand-voice-profile-card',
  },
  {
    actionType: 'workflow_created_card',
    expectations: [{ cardProp: 'onUiAction', rendererHandler: 'onUiAction' }],
    spy: cardPropsSpies.workflowCreated,
    testId: 'workflow-created-card',
  },
  {
    actionType: 'bot_created_card',
    expectations: [{ cardProp: 'onUiAction', rendererHandler: 'onUiAction' }],
    spy: cardPropsSpies.livestreamBot,
    testId: 'livestream-bot-card',
  },
  {
    actionType: 'livestream_bot_status_card',
    expectations: [{ cardProp: 'onUiAction', rendererHandler: 'onUiAction' }],
    spy: cardPropsSpies.livestreamBot,
    testId: 'livestream-bot-card',
  },
  {
    actionType: 'brand_interview_offer_card',
    expectations: [{ cardProp: 'onUiAction', rendererHandler: 'onUiAction' }],
    spy: cardPropsSpies.brandInterviewOffer,
    testId: 'brand-interview-offer-card',
  },
  {
    actionType: 'ai_text_action_card',
    expectations: [
      {
        cardProp: 'onApply',
        rendererHandler: 'onUiAction',
        wrapsHandler: true,
      },
    ],
    spy: cardPropsSpies.aiTextAction,
    testId: 'ai-text-action-card',
  },
] satisfies Array<{
  actionType: AgentUiAction['type'];
  expectations: HandlerExpectation[];
  spy: ReturnType<typeof vi.fn>;
  testId: string;
}>;

const apiServiceCases = [
  {
    actionType: 'generation_action_card',
    spy: cardPropsSpies.generationAction,
    testId: 'generation-action-card',
  },
  {
    actionType: 'workflow_trigger_card',
    spy: cardPropsSpies.workflowTrigger,
    testId: 'workflow-trigger-card',
  },
  {
    actionType: 'clip_workflow_run_card',
    spy: cardPropsSpies.clipWorkflowRun,
    testId: 'clip-workflow-run-card',
  },
  {
    actionType: 'ingredient_alternatives_card',
    spy: cardPropsSpies.ingredientAlternatives,
    testId: 'ingredient-alternatives-card',
  },
  {
    actionType: 'workflow_execute_card',
    spy: cardPropsSpies.workflowExecute,
    testId: 'workflow-execute-card',
  },
  {
    actionType: 'voice_clone_card',
    spy: cardPropsSpies.voiceClone,
    testId: 'voice-clone-card',
  },
] satisfies Array<{
  actionType: AgentUiAction['type'];
  spy: ReturnType<typeof vi.fn>;
  testId: string;
}>;

const rendererHandlers = {
  onBrandCreate: vi.fn(),
  onCopy: vi.fn(),
  onOAuthConnect: vi.fn(),
  onRetry: vi.fn(),
  onSelectCreditPack: vi.fn(),
  onSelectIngredient: vi.fn(),
  onUiAction: vi.fn(),
};

describe('UiActionRenderer', () => {
  it.each(handlerDrivenCases)(
    'strips handlers and makes archived $actionType inert',
    ({ actionType, expectations, spy, testId }) => {
      const action = {
        id: `${actionType}-1`,
        type: actionType,
      } as AgentUiAction;
      spy.mockClear();

      const { rerender } = render(
        <UiActionRenderer action={action} {...rendererHandlers} />,
      );

      expect(screen.getByTestId(testId)).toBeInTheDocument();
      const liveProps = spy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      for (const expectation of expectations) {
        if (expectation.wrapsHandler) {
          expect(liveProps[expectation.cardProp]).toEqual(expect.any(Function));
        } else {
          expect(liveProps[expectation.cardProp]).toBe(
            rendererHandlers[expectation.rendererHandler],
          );
        }
      }

      spy.mockClear();
      rerender(
        <UiActionRenderer action={action} isReadOnly {...rendererHandlers} />,
      );

      expect(screen.getByTestId(testId)).toBeInTheDocument();
      expect(screen.getByTestId('ui-action-archived-readonly')).toHaveAttribute(
        'inert',
      );
      const archivedProps = spy.mock.calls.at(-1)?.[0] as Record<
        string,
        unknown
      >;
      for (const expectation of expectations) {
        expect(archivedProps[expectation.cardProp]).toBeUndefined();
      }
    },
  );

  it.each(apiServiceCases)(
    'does not mount archived $actionType apiService mutation cards',
    ({ actionType, spy, testId }) => {
      const apiService = { marker: actionType };
      const action = {
        id: `${actionType}-1`,
        type: actionType,
      } as AgentUiAction;
      spy.mockClear();

      const { rerender } = render(
        <UiActionRenderer action={action} apiService={apiService as never} />,
      );

      expect(screen.getByTestId(testId)).toBeInTheDocument();
      expect(spy.mock.calls.at(-1)?.[0].apiService).toBe(apiService);

      spy.mockClear();
      rerender(
        <UiActionRenderer
          action={action}
          apiService={apiService as never}
          isReadOnly
        />,
      );

      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
      expect(spy).not.toHaveBeenCalled();
    },
  );

  it('routes generation confirmation through the live thread action handler', () => {
    const apiService = { marker: 'generation' };
    const onUiAction = vi.fn();
    const action = {
      id: 'generation-action-1',
      type: 'generation_action_card',
    } as AgentUiAction;
    cardPropsSpies.generationAction.mockClear();

    const { rerender } = render(
      <UiActionRenderer
        action={action}
        apiService={apiService as never}
        onUiAction={onUiAction}
      />,
    );

    expect(
      cardPropsSpies.generationAction.mock.calls.at(-1)?.[0],
    ).toMatchObject({
      apiService,
      onUiAction,
    });

    cardPropsSpies.generationAction.mockClear();
    rerender(
      <UiActionRenderer
        action={action}
        apiService={apiService as never}
        isDisabled
        onUiAction={onUiAction}
      />,
    );

    expect(
      cardPropsSpies.generationAction.mock.calls.at(-1)?.[0].onUiAction,
    ).toBeUndefined();
  });

  it('adapts a successful onUiAction outcome for brand identity confirmation cards', async () => {
    const onUiAction = vi.fn().mockResolvedValue(true);
    const action = {
      id: 'brand-confirmation-1',
      type: 'brand_identity_confirmation_card',
    } as AgentUiAction;

    render(<UiActionRenderer action={action} onUiAction={onUiAction} />);

    expect(
      screen.getByTestId('brand-identity-confirmation-card'),
    ).toBeInTheDocument();
    const confirmationHandler =
      cardPropsSpies.brandIdentityConfirmation.mock.calls.at(-1)?.[0]
        .onUiAction as
        | ((
            actionName: string,
            payload?: Record<string, unknown>,
          ) => Promise<boolean>)
        | undefined;

    if (!confirmationHandler) {
      throw new Error('Brand confirmation handler was not forwarded.');
    }

    await expect(
      confirmationHandler('confirm_create_brand', { label: 'Genfeed' }),
    ).resolves.toBe(true);
    expect(onUiAction).toHaveBeenCalledWith('confirm_create_brand', {
      label: 'Genfeed',
    });
  });

  it('adapts a void legacy outcome to failure for brand confirmation cards', async () => {
    const onUiAction = vi.fn().mockResolvedValue(undefined);
    const action = {
      id: 'brand-confirmation-void',
      type: 'brand_identity_confirmation_card',
    } as AgentUiAction;

    render(<UiActionRenderer action={action} onUiAction={onUiAction} />);

    const confirmationHandler =
      cardPropsSpies.brandIdentityConfirmation.mock.calls.at(-1)?.[0]
        .onUiAction as
        | ((
            actionName: string,
            payload?: Record<string, unknown>,
          ) => Promise<boolean>)
        | undefined;

    if (!confirmationHandler) {
      throw new Error('Brand confirmation handler was not forwarded.');
    }

    await expect(confirmationHandler('confirm_create_brand')).resolves.toBe(
      false,
    );
  });

  it('makes archived brand identity confirmations inert and drops their handler', () => {
    const onUiAction = vi.fn();
    const action = {
      id: 'brand-confirmation-archived',
      type: 'brand_identity_confirmation_card',
    } as AgentUiAction;

    render(
      <UiActionRenderer action={action} isReadOnly onUiAction={onUiAction} />,
    );

    expect(screen.getByTestId('ui-action-archived-readonly')).toHaveAttribute(
      'inert',
    );
    expect(
      cardPropsSpies.brandIdentityConfirmation.mock.calls.at(-1)?.[0]
        .onUiAction,
    ).toBeUndefined();
  });

  it('keeps busy action cards visible but inert and drops their handler', () => {
    const onUiAction = vi.fn();
    const action = {
      id: 'brand-confirmation-busy',
      type: 'brand_identity_confirmation_card',
    } as AgentUiAction;

    render(
      <UiActionRenderer action={action} isDisabled onUiAction={onUiAction} />,
    );

    expect(screen.getByTestId('ui-action-busy')).toHaveAttribute('inert');
    expect(
      cardPropsSpies.brandIdentityConfirmation.mock.calls.at(-1)?.[0]
        .onUiAction,
    ).toBeUndefined();
  });

  it('preserves a card instance while its action is busy', () => {
    const action = {
      id: 'brand-voice-busy-state',
      type: 'brand_voice_profile_card',
    } as AgentUiAction;

    const { rerender } = render(
      <UiActionRenderer action={action} {...rendererHandlers} />,
    );
    const liveCard = screen.getByTestId('brand-voice-profile-card');

    rerender(
      <UiActionRenderer action={action} isDisabled {...rendererHandlers} />,
    );

    expect(screen.getByTestId('brand-voice-profile-card')).toBe(liveCard);

    rerender(<UiActionRenderer action={action} {...rendererHandlers} />);

    expect(screen.getByTestId('brand-voice-profile-card')).toBe(liveCard);
  });

  it('keeps busy api-backed cards visible inside the inert shell', () => {
    const apiService = { marker: 'workflow-trigger' };
    const action = {
      id: 'workflow-trigger-busy',
      type: 'workflow_trigger_card',
    } as AgentUiAction;

    render(
      <UiActionRenderer
        action={action}
        apiService={apiService as never}
        isDisabled
      />,
    );

    expect(screen.getByTestId('workflow-trigger-card')).toBeInTheDocument();
    expect(screen.getByTestId('ui-action-busy')).toHaveAttribute('inert');
    expect(
      cardPropsSpies.workflowTrigger.mock.calls.at(-1)?.[0].apiService,
    ).toBe(apiService);
  });
});
