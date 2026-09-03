import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { resolveEffectiveBrandAgentConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { resolveClipIdentity } from '@api/collections/clip-projects/services/clip-identity-resolution.util';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { toVoiceCatalogWireFormat } from '@api/collections/voices/utils/voice-provider.util';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { scopedWhere } from '@api/index';
import {
  AGENT_NEXT_STEP_DESTINATIONS,
  isAgentNextStepDestinationKey,
} from '@api/services/agent-orchestrator/constants/agent-next-step-destinations.constant';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import {
  generationTypeLockError,
  resolveLockedGenerationType,
  type ThreadGenerationType,
} from '@api/services/agent-orchestrator/utils/thread-generation-type.util';
import {
  isExplicitAgentMediaGenerationMode,
  VoiceCloneStatus,
  VoiceProvider,
} from '@genfeedai/contracts';
import type {
  AgentClipRunIdentity,
  AgentNextStepOption,
  AgentToolResult,
  AgentUiActionCta,
} from '@genfeedai/contracts/interfaces';
import { Inject, Injectable, Optional } from '@nestjs/common';

interface AgentBrandsServiceLike {
  findOne: (
    params: Record<string, unknown>,
    context?: string,
  ) => Promise<Record<string, unknown> | null>;
}

/**
 * Prepare/UI handoff tools (generation, workflow trigger, voice clone, clip run,
 * next-step suggestions).
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentPrepareToolHandler {
  constructor(
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    private readonly workflowsService: WorkflowsService,
    @Optional()
    private readonly organizationSettingsService?: OrganizationSettingsService,
    @Optional()
    private readonly voicesService?: VoicesService,
    @Optional()
    private readonly externalVoiceCatalogService?: ExternalVoiceCatalogService,
    @Optional()
    private readonly agentMessagesService?: AgentMessagesService,
  ) {}
  async prepareGeneration(
    params: Record<string, unknown>,
    ctx?: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const requestedGenerationType =
      params.generationType as ThreadGenerationType;
    const generationType = isExplicitAgentMediaGenerationMode(
      ctx?.generationMode,
    )
      ? ctx.generationMode
      : requestedGenerationType;
    const prompt = params.prompt as string | undefined;
    const model = params.model as string | undefined;
    const aspectRatio = params.aspectRatio as string | undefined;
    const duration = params.duration as number | undefined;

    if (!isExplicitAgentMediaGenerationMode(generationType) || !prompt) {
      return {
        creditsUsed: 0,
        error: 'generationType and prompt are required',
        success: false,
      };
    }

    const lockError = isExplicitAgentMediaGenerationMode(ctx?.generationMode)
      ? null
      : generationTypeLockError(
          generationType,
          await this.readLockedGenerationType(ctx),
        );
    if (lockError) {
      return {
        creditsUsed: 0,
        error: lockError,
        success: false,
      };
    }

    const title =
      generationType === 'video' ? 'Generate Video' : 'Generate Image';

    return {
      creditsUsed: 0,
      data: { generationType, prompt },
      nextActions: [
        {
          description: `Review and adjust parameters before generating`,
          generationParams: {
            aspectRatio: aspectRatio || '1:1',
            duration: generationType === 'video' ? duration || 5 : undefined,
            model,
            prompt,
          },
          generationType,
          id: `gen-card-${Date.now()}`,
          title,
          type: 'generation_action_card' as const,
        },
      ],
      success: true,
    };
  }

  private async readLockedGenerationType(
    ctx?: ToolExecutionContext,
  ): Promise<ThreadGenerationType | null> {
    if (!ctx?.threadId || !ctx.organizationId || !this.agentMessagesService) {
      return null;
    }

    const messages = await this.agentMessagesService.getRecentMessages(
      ctx.threadId,
      50,
      ctx.organizationId,
    );

    return resolveLockedGenerationType(
      messages.map((message) => message.metadata),
    );
  }

  async prepareWorkflowTrigger(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min((params.limit as number) || 5, 5);

    const workflows = await this.workflowsService.findAll(
      {
        where: {
          isDeleted: false,
          organizationId: ctx.organizationId,
        },
        orderBy: { updatedAt: -1 },
      },
      {},
    );

    const workflowList = (workflows.docs ?? []).slice(0, limit).map((w) => {
      const workflow = w as unknown as Record<string, unknown>;
      return {
        description:
          typeof workflow.description === 'string'
            ? workflow.description
            : undefined,
        id: String(workflow.id),
        name:
          typeof workflow.name === 'string' && workflow.name.length > 0
            ? workflow.name
            : 'Workflow',
        status:
          typeof workflow.status === 'string' ? workflow.status : undefined,
      };
    });

    return {
      creditsUsed: 0,
      nextActions: [
        {
          id: `workflow-trigger-${Date.now()}`,
          title: 'Run a Workflow',
          type: 'workflow_trigger_card' as const,
          workflows: workflowList,
        },
      ],
      success: true,
    };
  }

  async prepareVoiceClone(
    ctx: ToolExecutionContext,
    params: Record<string, unknown> = {},
  ): Promise<AgentToolResult> {
    const currentBrand = await this.brandsService.findOne(
      {
        isSelected: true,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      },
      'none',
    );

    const orgSettings = this.organizationSettingsService
      ? await this.organizationSettingsService.findOne({
          organizationId: ctx.organizationId,
        })
      : null;

    const clonedVoices = this.voicesService
      ? await this.voicesService.findAll(
          {
            where: scopedWhere(ctx.organizationId, {
              OR: [
                { isCloned: true },
                { externalVoiceCatalogId: { not: null } },
              ],
            }),
            orderBy: { createdAt: -1 },
          },
          {},
        )
      : { docs: [] };

    let existingVoices =
      clonedVoices.docs?.map((voice: unknown) => {
        const v = voice as Record<string, unknown>;
        return {
          cloneStatus: (v.cloneStatus as string | undefined) ?? undefined,
          id: String(v.id),
          label:
            (v.metadataLabel as string | undefined) ??
            (v.label as string | undefined) ??
            'Voice',
          provider: (v.provider as string | undefined) ?? undefined,
        };
      }) ?? [];

    if (existingVoices.length === 0 && this.externalVoiceCatalogService) {
      const catalog = await this.externalVoiceCatalogService.findAll({
        isActive: true,
      });
      existingVoices = catalog.map((voice) => {
        const wire = toVoiceCatalogWireFormat(voice);
        return {
          cloneStatus: VoiceCloneStatus.READY,
          id: wire.externalVoiceId,
          label: wire.name,
          provider: wire.provider,
        };
      });
    }

    const readyVoices = existingVoices.filter(
      (voice) => voice.cloneStatus?.toUpperCase() === VoiceCloneStatus.READY,
    );

    const effectiveBrandAgentConfig = resolveEffectiveBrandAgentConfig({
      brand: currentBrand as Parameters<
        typeof resolveEffectiveBrandAgentConfig
      >[0]['brand'],
      organizationSettings: orgSettings as Parameters<
        typeof resolveEffectiveBrandAgentConfig
      >[0]['organizationSettings'],
    });
    const effectiveDefaultVoiceId =
      effectiveBrandAgentConfig.identityDefaults.effective.defaultVoiceId?.toString();

    const recommendedVoiceId = effectiveDefaultVoiceId || readyVoices[0]?.id;
    const voiceoverText =
      readOptionalString(params.text) ??
      readOptionalString(params.prompt) ??
      '';
    const hasCatalogBackedVoices = existingVoices.length > 0;
    const description = hasCatalogBackedVoices
      ? voiceoverText
        ? `Generate a voiceover with a catalog or cloned voice: "${voiceoverText}"`
        : 'Use an existing voice or upload a new audio sample.'
      : 'The voice catalog is empty. Upload an audio sample to clone a voice, or add catalog voices.';

    return {
      creditsUsed: 0,
      data: voiceoverText ? { text: voiceoverText } : undefined,
      nextActions: [
        {
          brandId: currentBrand
            ? String((currentBrand as { id: unknown }).id)
            : undefined,
          canUpload: true,
          canUseExisting: hasCatalogBackedVoices,
          description,
          existingVoices,
          id: `voice-clone-${Date.now()}`,
          recommendedVoiceId,
          title: voiceoverText ? 'Generate Voice' : 'Set Up Voice Clone',
          type: 'voice_clone_card' as const,
          voiceoverText: voiceoverText || undefined,
        },
      ],
      success: true,
    };
  }

  private resolveClipWorkflowIdentity(
    params: Record<string, unknown>,
    brand: unknown,
    organizationSettings: unknown,
  ): AgentClipRunIdentity {
    return resolveClipIdentity({
      avatarId:
        readOptionalString(params.avatarId) ??
        readOptionalString(params.heygenAvatarId),
      avatarProvider: readOptionalString(params.avatarProvider),
      brand,
      organizationSettings,
      voiceId:
        readOptionalString(params.voiceId) ??
        readOptionalString(params.heygenVoiceId),
      voiceProvider: readOptionalString(params.voiceProvider),
    });
  }

  private buildClipIdentityInputValues(
    identity: AgentClipRunIdentity,
  ): Record<string, unknown> {
    const values: Record<string, unknown> = {
      identitySource: identity.source,
      identityStatus: identity.isComplete ? 'ready' : 'missing_identity',
      missingIdentity: identity.missing,
      useIdentity: identity.useIdentity,
    };

    if (identity.avatarId) {
      values.avatarId = identity.avatarId;
      values.avatarProvider = identity.avatarProvider ?? VoiceProvider.HEYGEN;

      if (
        (identity.avatarProvider ?? VoiceProvider.HEYGEN) ===
        VoiceProvider.HEYGEN
      ) {
        values.heygenAvatarId = identity.avatarId;
      }
    }

    if (identity.voiceId) {
      values.voiceId = identity.voiceId;
      values.voiceProvider = identity.voiceProvider ?? VoiceProvider.HEYGEN;

      if (
        (identity.voiceProvider ?? VoiceProvider.HEYGEN) ===
        VoiceProvider.HEYGEN
      ) {
        values.heygenVoiceId = identity.voiceId;
      }
    }

    return values;
  }

  async prepareClipWorkflowRun(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const currentBrand = await this.brandsService.findOne(
      {
        isSelected: true,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      },
      'none',
    );
    const selectedBrandId = currentBrand
      ? String((currentBrand as Record<string, unknown>).id)
      : null;
    const orgSettings = this.organizationSettingsService
      ? await this.organizationSettingsService.findOne({
          organizationId: ctx.organizationId,
        })
      : null;
    const identity = this.resolveClipWorkflowIdentity(
      params,
      currentBrand,
      orgSettings,
    );
    const identityInputValues = this.buildClipIdentityInputValues(identity);
    const requestedWorkflowId = (
      params.workflowId as string | undefined
    )?.trim();
    const prompt =
      ((params.prompt as string | undefined)?.trim() ??
        (params.topic as string | undefined)?.trim()) ||
      'Create a 30-second landscape clip for Twitter/X';
    const durationSeconds = Math.max(
      5,
      Math.min(60, Number(params.durationSeconds ?? params.duration ?? 30)),
    );
    const model = (params.model as string | undefined)?.trim() || undefined;
    const autonomousMode = Boolean(params.autonomousMode ?? true);
    const requireStepConfirmation = Boolean(
      params.requireStepConfirmation ?? true,
    );
    const mergeGeneratedVideos = Boolean(params.mergeGeneratedVideos ?? true);

    const workflows = await this.workflowsService.findAll(
      {
        where: {
          isDeleted: false,
          organizationId: ctx.organizationId,
        },
        orderBy: { updatedAt: -1 },
      },
      {},
    );

    const workflowList =
      workflows.docs?.map((w: unknown) => {
        const doc = w as Record<string, unknown>;
        return {
          description:
            typeof doc.description === 'string' ? doc.description : undefined,
          id: String(doc.id),
          name:
            typeof doc.name === 'string' && doc.name.length > 0
              ? doc.name
              : 'Workflow',
          status: typeof doc.status === 'string' ? doc.status : undefined,
        };
      }) ?? [];

    let selectedWorkflow = requestedWorkflowId;
    if (!selectedWorkflow && workflowList.length > 0) {
      selectedWorkflow = workflowList[0].id;
    }

    if (
      selectedWorkflow &&
      !workflowList.some((wf) => wf.id === selectedWorkflow)
    ) {
      const workflow = await this.workflowsService.findOne({
        id: selectedWorkflow,
        organizationId: ctx.organizationId,
      });

      if (!workflow) {
        return {
          creditsUsed: 0,
          error: `Workflow ${selectedWorkflow} not found`,
          success: false,
        };
      }

      const wf = workflow as unknown as Record<string, unknown>;
      workflowList.unshift({
        description:
          typeof wf.description === 'string' ? wf.description : undefined,
        id: String(wf.id ?? selectedWorkflow),
        name:
          typeof wf.name === 'string' && wf.name.length > 0
            ? wf.name
            : 'Workflow',
        status: typeof wf.status === 'string' ? wf.status : undefined,
      });
    }

    return {
      creditsUsed: 0,
      data: {
        durationSeconds,
        format: 'landscape',
        identity,
        intent: 'twitter_clip',
        mergeGeneratedVideos,
        prompt,
      },
      nextActions: [
        {
          brandId: selectedBrandId ?? undefined,
          clipRun: {
            autonomousMode,
            durationSeconds,
            format: 'landscape',
            identity,
            inputValues: {
              confirmBeforePublish: true,
              duration: durationSeconds,
              format: 'landscape',
              ...identityInputValues,
              intent: 'twitter_clip',
              mergeGeneratedVideos,
              prompt,
            },
            mergeGeneratedVideos,
            model,
            prompt,
            requireStepConfirmation,
          },
          clipRunState: {
            brandId: selectedBrandId ?? '',
            clipProjectId: selectedWorkflow ?? `clip-${Date.now()}`,
            currentStep: 'generate',
            identity,
            modes: {
              aspectRatio: '16:9' as const,
              confirmBeforePublish: true,
              duration: (durationSeconds <= 15
                ? 15
                : durationSeconds <= 30
                  ? 30
                  : 60) as 15 | 30 | 60,
              enableMerge: mergeGeneratedVideos,
              enableReframe: false,
              platform: 'twitter' as const,
            },
            organizationId: ctx.organizationId,
            status: 'idle' as const,
            steps: [
              {
                id: 'generate',
                label: 'Generate Clip',
                retryable: true,
                status: 'pending' as const,
              },
              {
                id: 'merge',
                label: 'Merge Clips',
                retryable: true,
                status: mergeGeneratedVideos
                  ? ('pending' as const)
                  : ('skipped' as const),
              },
              {
                id: 'reframe',
                label: 'Reframe Portrait',
                retryable: true,
                status: 'pending' as const,
              },
              {
                id: 'publish-handoff',
                label: 'Publish Handoff',
                retryable: false,
                status: 'pending' as const,
              },
            ],
          },
          description: identity.isComplete
            ? 'Generate a 30-second landscape clip, optionally merge multiple clips, then reframe to portrait for Instagram.'
            : 'Clip identity defaults are incomplete. Add the missing avatar or voice defaults before generating.',
          id: `clip-workflow-run-${Date.now()}`,
          title: 'Run Clip Workflow (X → IG)',
          type: 'clip_workflow_run_card' as const,
          workflowDescription: workflowList.find(
            (wf) => wf.id === selectedWorkflow,
          )?.description,
          workflowId: selectedWorkflow,
          workflowName: workflowList.find((wf) => wf.id === selectedWorkflow)
            ?.name,
          workflows: workflowList,
        },
      ],
      success: true,
    };
  }

  /**
   * Turns the choices the model wants to offer into a card of real controls.
   * Numbered prose ("1. Connect an account 2. Brand setup …") leaves the user
   * with nothing to click, so every step resolves to at least one CTA: a link
   * to the page that owns it, an in-conversation follow-up prompt, or both.
   *
   * Destinations are server-owned keys — the model never authors a URL.
   */
  suggestNextSteps(params: Record<string, unknown>): AgentToolResult {
    const steps = Array.isArray(params.steps) ? params.steps : [];
    const prompt = readOptionalString(params.prompt);

    if (steps.length === 0) {
      return {
        creditsUsed: 0,
        error:
          'steps must contain at least one entry with a title and either a destination or a prompt',
        success: false,
      };
    }

    const options: AgentNextStepOption[] = [];
    const rejectedPositions: number[] = [];

    steps.forEach((step, index) => {
      const option = this.buildNextStepOption(step, index);
      if (option) {
        options.push(option);
      } else {
        rejectedPositions.push(index + 1);
      }
    });

    // A partially valid batch must not silently drop choices the model wanted
    // to offer — fail the whole call loudly so the model can fix and retry.
    if (rejectedPositions.length > 0) {
      const label =
        rejectedPositions.length === 1
          ? `step ${rejectedPositions[0]} is`
          : `steps ${rejectedPositions.join(', ')} are`;

      return {
        creditsUsed: 0,
        error: `${label} not actionable: every step needs a title and a known destination key and/or a prompt`,
        success: false,
      };
    }

    return {
      creditsUsed: 0,
      data: { stepCount: options.length },
      nextActions: [
        {
          description: prompt,
          id: `next-steps-${Date.now()}`,
          nextSteps: options,
          title: 'What would you like to do?',
          type: 'next_steps_card' as const,
        },
      ],
      success: true,
    };
  }

  private buildNextStepOption(
    step: unknown,
    index: number,
  ): AgentNextStepOption | null {
    if (typeof step !== 'object' || step === null) {
      return null;
    }

    const candidate = step as Record<string, unknown>;
    const destinationKey = readOptionalString(candidate.destination);
    const destination = isAgentNextStepDestinationKey(destinationKey)
      ? AGENT_NEXT_STEP_DESTINATIONS[destinationKey]
      : undefined;
    const followUpPrompt = readOptionalString(candidate.prompt);
    const title = readOptionalString(candidate.title) ?? destination?.label;

    // A step with neither a page nor a follow-up prompt is prose again.
    if (!title || (!destination && !followUpPrompt)) {
      return null;
    }

    const ctas: AgentUiActionCta[] = [];

    if (destination) {
      ctas.push({ href: destination.href, label: destination.ctaLabel });
    }

    if (followUpPrompt) {
      ctas.push({
        action: 'send_prompt',
        label: destination ? 'Do it here' : 'Continue here',
        payload: { prompt: followUpPrompt },
      });
    }

    return {
      ctas,
      description: readOptionalString(candidate.description),
      id: `next-step-${index + 1}-${destinationKey ?? 'inline'}`,
      title,
    };
  }
}
