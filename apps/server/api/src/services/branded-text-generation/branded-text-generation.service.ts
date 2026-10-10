import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { BrandValidationReceiptService } from '@api/services/brand-validation/brand-validation-receipt.service';
import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { BrandedGenerationArtifactMaterialService } from '@api/services/branded-generation-receipts/branded-generation-artifact-material.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type {
  BrandedGenerationActorV1,
  BrandedGenerationMutationResultV1,
} from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import type { BrandedGenerationCompilerRecipeV1 } from '@api/services/branded-generation-receipts/branded-generation-recompile.types';
import type {
  BrandedTextGenerationOutcomeV1,
  BrandedTextGenerationRequestV1,
} from '@api/services/branded-text-generation/branded-text-generation.types';
import { brandedReceiptReasonCode } from '@api/services/branded-text-generation/branded-text-generation-outcome.util';
import { compileSnapshotBriefResolution } from '@api/services/harness/branded-generation-compiler';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { isOpenRouterTextModel } from '@api/services/integrations/openrouter/openrouter-model.util';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { SkillRuntimeService } from '@api/services/skill-runtime/skill-runtime.service';
import { brandedGenerationInputV1Schema } from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import { learningContractIdSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
  BrandedGenerationResolutionV1,
  BrandIdentitySnapshotV1,
  BrandLearningApplicationV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { z } from 'zod';

const generationParametersSchema = z.strictObject({
  maxTokens: z.number().int().min(1).max(32000),
  temperature: z.number().min(0).max(2),
});
type GenerationParameters = z.infer<typeof generationParametersSchema>;
type Mutation = BrandedGenerationMutationResultV1;
type ResolutionCapture = readonly [
  BrandedGenerationResolutionV1,
  BrandedGenerationCompilerRecipeV1 | null,
];

const RECOVERABLE_SNAPSHOT_FAILURES = new Set([
  'brand_identity_integrity_failed',
  'brand_identity_asset_unavailable',
]);

/**
 * Drives one approved-brand text generation through the saved receipt:
 * create → resolve → dispatch → bind → validate (#5786). One provider call per
 * receipt, never retried automatically; lifecycle outcomes are returned, not
 * thrown, so the caller can map them to its own transport.
 */
@Injectable()
export class BrandedTextGenerationService {
  constructor(
    private readonly receipts: BrandedGenerationReceiptsService,
    private readonly snapshots: BrandIdentitySnapshotService,
    private readonly material: BrandedGenerationArtifactMaterialService,
    private readonly validator: BrandValidationService,
    private readonly validation: BrandValidationReceiptService,
    private readonly harness: HarnessGenerationService,
    private readonly skills: SkillRuntimeService,
    private readonly openRouter: OpenRouterService,
    private readonly brandAccess: BrandAccessService,
  ) {}

  async generate(
    request: BrandedTextGenerationRequestV1,
  ): Promise<BrandedTextGenerationOutcomeV1> {
    return this.generateRequest(request, 'text');
  }

  /** Uses the normal receipt lifecycle; persistText must save every accepted segment as a complete thread. */
  async generateThread(
    request: BrandedTextGenerationRequestV1,
  ): Promise<BrandedTextGenerationOutcomeV1> {
    return this.generateRequest(request, 'thread');
  }

  private async generateRequest(
    request: BrandedTextGenerationRequestV1,
    format: 'text' | 'thread',
  ): Promise<BrandedTextGenerationOutcomeV1> {
    await request.reauthorize?.();
    const input = this.parseInput(request.input);
    if (
      request.initiatingActor.userId !== input.actorId ||
      request.initiatingActor.organizationId !== input.organizationId
    )
      throw new ForbiddenException('Brand access denied');
    await this.brandAccess.assert(request.initiatingActor, input.brandId);
    const parameters = this.assertPreconditions(input, format);
    const apiKey = await request.resolveApiKey(input.model);
    const actor: BrandedGenerationActorV1 = {
      organizationId: input.organizationId,
      brandId: input.brandId,
      actorId: input.actorId,
      isApiKey: request.initiatingActor.isApiKey,
      apiKeyId: request.initiatingActor.apiKeyId,
      scopes: request.initiatingActor.scopes,
    };
    const { receipt } = await this.receipts.create(input, actor);
    switch (receipt.state) {
      case 'created':
        return this.runFresh(
          actor,
          receipt,
          input,
          parameters,
          request,
          apiKey,
        );
      case 'resolved':
      case 'dispatched':
        return this.inProgress(receipt);
      case 'checking': {
        const validated = await this.validate(actor, receipt);
        return this.finish(validated, this.postIdOf(receipt), null, false);
      }
      case 'ready':
      case 'needs_review':
        return this.finish(receipt, this.postIdOf(receipt), null, false);
      default:
        return this.stopped(
          receipt,
          receipt.artifact?.id ?? null,
          brandedReceiptReasonCode(receipt),
          false,
        );
    }
  }

  private parseInput(
    value: BrandedGenerationInputV1,
  ): BrandedGenerationInputV1 {
    const parsed = brandedGenerationInputV1Schema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('branded_generation_input_invalid');
    return parsed.data;
  }

  private assertPreconditions(
    input: BrandedGenerationInputV1,
    format: 'text' | 'thread',
  ): GenerationParameters {
    if (input.mode !== 'approved_brand')
      throw new BadRequestException('brand_mode_unsupported');
    if (input.format !== format)
      throw new BadRequestException('brand_format_unsupported');
    if (input.provider !== 'openrouter' || !isOpenRouterTextModel(input.model))
      throw new UnprocessableEntityException('provider_capability_unsupported');
    const parameters = generationParametersSchema.safeParse(
      input.generationParameters,
    );
    if (!parameters.success)
      throw new BadRequestException('generation_parameters_invalid');
    return parameters.data;
  }

  private async runFresh(
    actor: BrandedGenerationActorV1,
    created: BrandedGenerationReceiptV1,
    input: BrandedGenerationInputV1,
    parameters: GenerationParameters,
    request: BrandedTextGenerationRequestV1,
    apiKey: string | undefined,
  ): Promise<BrandedTextGenerationOutcomeV1> {
    const [resolution, compiledPrompt] = await this.resolve(
      actor,
      created,
      input,
      request.privateLearning,
    );
    if (resolution.replayed) return this.inProgress(resolution.receipt);
    if (resolution.receipt.state !== 'resolved' || compiledPrompt === null)
      return this.stopped(
        resolution.receipt,
        null,
        brandedReceiptReasonCode(resolution.receipt),
        false,
      );
    const resolved = resolution.receipt;
    await request.reauthorize?.();
    await request.admitDispatch?.();
    await request.reauthorize?.();
    const dispatchClaimedAt = new Date().toISOString();
    await this.brandAccess.assert(
      { ...actor, userId: actor.actorId },
      input.brandId,
    );
    const accepted = await this.dispatchToProvider(
      input,
      parameters,
      compiledPrompt,
      apiKey,
    );
    if (accepted === null)
      return this.settle(
        await this.receipts.blockBeforeDispatch(
          actor,
          resolved.id,
          this.mutation(resolved, 'block'),
          'provider_attempt_ref_unavailable',
        ),
        null,
        'provider_attempt_ref_unavailable',
        false,
      );
    const dispatched = await this.receipts.recordDispatch(
      actor,
      resolved.id,
      this.mutation(resolved, 'dispatch'),
      {
        provider: 'openrouter',
        model: input.model,
        providerAttemptRef: accepted.providerAttemptRef,
        dispatchClaimedAt,
        providerAcceptedAt: new Date().toISOString(),
      },
    );
    if (dispatched.replayed) return this.inProgress(dispatched.receipt);
    return this.completeOutput(
      actor,
      dispatched.receipt,
      accepted.text,
      request,
    );
  }

  private async completeOutput(
    actor: BrandedGenerationActorV1,
    dispatched: BrandedGenerationReceiptV1,
    rawText: string,
    request: BrandedTextGenerationRequestV1,
  ): Promise<BrandedTextGenerationOutcomeV1> {
    const text = rawText.trim();
    if (!text)
      return this.fail(actor, dispatched, 'provider_output_empty', null);
    if (!request.acceptText(text))
      return this.fail(actor, dispatched, 'channel_limit_exceeded', null);
    let postId: string;
    // A revoked continuation never gets converted into an artifact-persistence failure.
    await request.reauthorize?.();
    try {
      ({ postId } = await request.persistText(text));
    } catch {
      return this.fail(actor, dispatched, 'artifact_persist_failed', null);
    }
    let bound: Mutation;
    await request.reauthorize?.();
    try {
      const binding = await this.material.describePostArtifact(actor, postId);
      bound = await this.receipts.bindArtifact(
        actor,
        dispatched.id,
        this.mutation(dispatched, 'bind'),
        { ...binding, completedAt: new Date().toISOString() },
      );
    } catch {
      return this.fail(actor, dispatched, 'artifact_bind_failed', postId);
    }
    if (bound.replayed) return this.inProgress(bound.receipt);
    const validated = await this.validate(actor, bound.receipt);
    return this.finish(validated, postId, text, true);
  }

  /** Never throws for provider trouble: a missing attempt reference blocks. */
  private async dispatchToProvider(
    input: BrandedGenerationInputV1,
    parameters: GenerationParameters,
    compiledPrompt: string,
    apiKey: string | undefined,
  ): Promise<{ providerAttemptRef: string; text: string } | null> {
    try {
      const response = await this.openRouter.chatCompletion(
        {
          model: input.model,
          messages: [{ role: 'user', content: compiledPrompt }],
          max_tokens: parameters.maxTokens,
          temperature: parameters.temperature,
        },
        apiKey,
      );
      const providerAttemptRef = `openrouter:${response.id ?? ''}`;
      if (
        !response.id ||
        !learningContractIdSchema.safeParse(providerAttemptRef).success
      )
        return null;
      return {
        providerAttemptRef,
        text: response.choices?.[0]?.message?.content ?? '',
      };
    } catch {
      return null;
    }
  }

  private async resolve(
    actor: BrandedGenerationActorV1,
    receipt: BrandedGenerationReceiptV1,
    input: BrandedGenerationInputV1,
    privateLearning: BrandedTextGenerationRequestV1['privateLearning'],
  ): Promise<[Mutation, string | null]> {
    const learning = this.baselineLearning(input, privateLearning);
    const [resolution, recipe] = await this.compile(actor, input, learning);
    const mutation = this.mutation(receipt, 'resolve');
    const result =
      resolution.status === 'resolved' && recipe
        ? await this.receipts.recordCompiledResolution(
            actor,
            receipt.id,
            mutation,
            resolution,
            input,
            recipe,
          )
        : await this.receipts.recordResolution(
            actor,
            receipt.id,
            mutation,
            resolution,
          );
    return [
      result,
      resolution.status === 'resolved' ? resolution.compiledPrompt : null,
    ];
  }

  private async compile(
    actor: BrandedGenerationActorV1,
    input: BrandedGenerationInputV1,
    learning: BrandLearningApplicationV1,
  ): Promise<ResolutionCapture> {
    const blocked = (
      snapshot: BrandIdentitySnapshotV1 | null,
      failure: readonly [string, string?],
    ): ResolutionCapture => [
      compileSnapshotBriefResolution(
        input,
        snapshot,
        learning,
        {},
        [],
        [],
        [],
        failure,
      ),
      null,
    ];
    let snapshot: BrandIdentitySnapshotV1 | null = null;
    try {
      snapshot = await this.snapshots.preview(actor);
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
      const code = error.message;
      if (RECOVERABLE_SNAPSHOT_FAILURES.has(code)) return blocked(null, [code]);
      if (code !== 'brand_identity_unavailable') throw error;
      return this.harness.resolveSnapshotBriefWithRecipe(
        input,
        null,
        [],
        undefined,
        () => '',
        learning,
        {},
        { ...actor, userId: actor.actorId },
      );
    }
    const preflight = this.validator.preflightBrandCapabilities({
      snapshot,
      provider: input.provider,
      model: input.model,
      mediaKind: 'text',
    });
    if (preflight.status === 'blocked') {
      const first = preflight.diagnostics.find(
        (diagnostic) => diagnostic.severity === 'error',
      );
      return blocked(snapshot, [
        'unsupported_capability',
        first?.code ?? 'unsupported_capability',
      ]);
    }
    let skills: Awaited<ReturnType<SkillRuntimeService['resolveActiveSkills']>>;
    try {
      skills = await this.skills.resolveActiveSkills(
        input.organizationId,
        input.brandId,
        undefined,
        {
          actorUserId: input.actorId,
          channel: input.platform,
          modality: 'text',
        },
      );
    } catch {
      throw new ServiceUnavailableException('skill_context_unavailable');
    }
    return this.harness.resolveSnapshotBriefWithRecipe(
      input,
      snapshot,
      skills,
      undefined,
      this.skills.buildSkillPromptSections.bind(this.skills),
      learning,
      {},
      { ...actor, userId: actor.actorId },
    );
  }

  /** Global learning is honestly unavailable until #5788 supplies a release. */
  private baselineLearning(
    input: BrandedGenerationInputV1,
    privateAccount: BrandedTextGenerationRequestV1['privateLearning'],
  ): BrandLearningApplicationV1 {
    return {
      schemaVersion: 1,
      brandFeedback: { status: 'not_applicable', sourceIds: [] },
      global: {
        status: 'unavailable',
        reasonCode: 'global_learning_unavailable',
        scope: {
          format: input.format,
          objective: input.objective ?? 'engagement',
          ...(input.platform ? { platform: input.platform } : {}),
        },
      },
      privateAccount,
    };
  }

  private async validate(
    actor: BrandedGenerationActorV1,
    receipt: BrandedGenerationReceiptV1,
  ): Promise<BrandedGenerationReceiptV1> {
    if (receipt.actorId !== actor.actorId)
      throw new ForbiddenException('receipt_access_denied');
    try {
      return (await this.validation.validateReceipt(actor, receipt.id)).receipt;
    } catch {
      try {
        return (
          await this.receipts.recordValidation(
            actor,
            receipt.id,
            this.mutation(receipt, 'validation-unavailable'),
            'validate',
            null,
          )
        ).receipt;
      } catch {
        return receipt;
      }
    }
  }

  private async fail(
    actor: BrandedGenerationActorV1,
    dispatched: BrandedGenerationReceiptV1,
    reasonCode: string,
    postId: string | null,
  ): Promise<BrandedTextGenerationOutcomeV1> {
    const result = await this.receipts.fail(
      actor,
      dispatched.id,
      this.mutation(dispatched, 'fail'),
      { reasonCode, completedAt: new Date().toISOString() },
    );
    return this.settle(result, postId, reasonCode, true);
  }

  private settle(
    result: Mutation,
    postId: string | null,
    reasonCode: string,
    hasNewDispatch: boolean,
  ): BrandedTextGenerationOutcomeV1 {
    return result.replayed
      ? this.inProgress(result.receipt)
      : this.stopped(result.receipt, postId, reasonCode, hasNewDispatch);
  }

  private finish(
    receipt: BrandedGenerationReceiptV1,
    postId: string,
    text: string | null,
    hasNewDispatch: boolean,
  ): BrandedTextGenerationOutcomeV1 {
    if (
      receipt.state === 'ready' ||
      receipt.state === 'needs_review' ||
      receipt.state === 'checking'
    )
      return { kind: 'completed', receipt, postId, text, hasNewDispatch };
    return this.stopped(
      receipt,
      postId,
      brandedReceiptReasonCode(receipt),
      hasNewDispatch,
    );
  }

  private stopped(
    receipt: BrandedGenerationReceiptV1,
    postId: string | null,
    reasonCode: string,
    hasNewDispatch: boolean,
  ): BrandedTextGenerationOutcomeV1 {
    return { kind: 'stopped', receipt, postId, reasonCode, hasNewDispatch };
  }

  private inProgress(
    receipt: BrandedGenerationReceiptV1,
  ): BrandedTextGenerationOutcomeV1 {
    return { kind: 'in_progress', receipt, hasNewDispatch: false };
  }

  private postIdOf(receipt: BrandedGenerationReceiptV1): string {
    if (!receipt.artifact)
      throw new InternalServerErrorException('receipt_artifact_missing');
    return receipt.artifact.id;
  }

  private mutation(receipt: BrandedGenerationReceiptV1, step: string) {
    return {
      operationKey: `${receipt.id}:${step}`,
      expectedRevision: receipt.revision,
    };
  }
}
