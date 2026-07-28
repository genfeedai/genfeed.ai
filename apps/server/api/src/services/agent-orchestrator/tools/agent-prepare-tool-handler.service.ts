import { resolveEffectiveBrandAgentConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { resolveClipIdentity } from '@api/collections/clip-projects/services/clip-identity-resolution.util';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { VoiceCloneStatus, VoiceProvider } from '@genfeedai/enums';
import type {
  AgentClipRunIdentity,
  AgentToolResult,
} from '@genfeedai/interfaces';
import { scopedWhere } from '@genfeedai/server';
import { Inject, Injectable, Optional } from '@nestjs/common';

interface AgentBrandsServiceLike {
  findOne: (
    params: Record<string, unknown>,
    context?: string,
  ) => Promise<Record<string, unknown> | null>;
}

/**
 * Prepare/UI handoff tools (generation, workflow trigger, voice clone, clip run).
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
  ) {}
  prepareGeneration(params: Record<string, unknown>): AgentToolResult {
    const generationType = params.generationType as 'image' | 'video';
    const prompt = params.prompt as string | undefined;
    const model = params.model as string | undefined;
    const aspectRatio = params.aspectRatio as string | undefined;
    const duration = params.duration as number | undefined;

    if (!generationType || !prompt) {
      return {
        creditsUsed: 0,
        error: 'generationType and prompt are required',
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

  async prepareWorkflowTrigger(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min((params.limit as number) || 5, 5);

    const workflows = await this.workflowsService.findAll(
      {
        where: {
          isDeleted: false,
          organization: ctx.organizationId,
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

  async prepareVoiceClone(ctx: ToolExecutionContext): Promise<AgentToolResult> {
    const currentBrand = await this.brandsService.findOne(
      {
        isDeleted: false,
        isSelected: true,
        organization: ctx.organizationId,
        user: ctx.userId,
      },
      'none',
    );

    const orgSettings = this.organizationSettingsService
      ? await this.organizationSettingsService.findOne({
          isDeleted: false,
          organization: ctx.organizationId,
        })
      : null;

    const clonedVoices = this.voicesService
      ? await this.voicesService.findAll(
          {
            where: scopedWhere(ctx.organizationId, { isCloned: true }),
            orderBy: { createdAt: -1 },
          },
          {},
        )
      : { docs: [] };

    const existingVoices =
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

    const readyVoices = existingVoices.filter(
      (voice) =>
        voice.cloneStatus?.toLowerCase() === VoiceCloneStatus.READY ||
        voice.cloneStatus?.toLowerCase() === 'ready',
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

    return {
      creditsUsed: 0,
      nextActions: [
        {
          brandId: currentBrand
            ? String((currentBrand as { id: unknown }).id)
            : undefined,
          canUpload: true,
          canUseExisting: existingVoices.length > 0,
          description:
            existingVoices.length > 0
              ? 'Use an existing cloned voice or upload a new audio sample.'
              : 'No cloned voices found. Upload an audio sample to start cloning.',
          existingVoices,
          id: `voice-clone-${Date.now()}`,
          recommendedVoiceId,
          title: 'Set Up Voice Clone',
          type: 'voice_clone_card' as const,
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
        isDeleted: false,
        isSelected: true,
        organization: ctx.organizationId,
        user: ctx.userId,
      },
      'none',
    );
    const selectedBrandId = currentBrand
      ? String((currentBrand as Record<string, unknown>).id)
      : null;
    const orgSettings = this.organizationSettingsService
      ? await this.organizationSettingsService.findOne({
          isDeleted: false,
          organization: ctx.organizationId,
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
          organization: ctx.organizationId,
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
        _id: selectedWorkflow,
        isDeleted: false,
        organization: ctx.organizationId,
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
}
