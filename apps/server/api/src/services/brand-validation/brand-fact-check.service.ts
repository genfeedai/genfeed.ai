import { KnowledgeContentRetrievalService } from '@api/collections/contexts/services/knowledge-content-retrieval.service';
import {
  FreeTrialExpiredException,
  InsufficientCreditsException,
  PlanLimitExceededException,
} from '@api/exceptions/business-logic.exception';
import type {
  BrandFactCheckOutcome,
  BrandFactCheckRequest,
  BrandFactCheckUnavailableReason,
  BrandFactEvidenceItem,
  BrandKnowledgeVersionRef,
} from '@api/services/brand-validation/brand-fact-check.types';
import {
  brandOsEvidence,
  FACT_PASSAGES_PER_CLAIM,
  isQuoteOf,
  knowledgeEvidence,
  MAX_FACT_KNOWLEDGE_PASSAGES,
  settleFactClaims,
} from '@api/services/brand-validation/brand-fact-check-evidence.util';
import {
  buildExtractionMessages,
  buildJudgmentMessages,
  FACT_EXTRACTION_SCHEMA_NAME,
  FACT_JUDGMENT_SCHEMA_NAME,
  type FactExtraction,
  type FactJudgment,
  factExtractionSchema,
  factJudgmentSchema,
  MAX_FACT_CHECK_TEXT_LENGTH,
  MAX_FACT_CLAIMS,
} from '@api/services/brand-validation/brand-fact-check-prompt.util';
import type { BrandedGenerationActorV1 } from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import type { OpenRouterMessage } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import type { BrandContentMemoryHit } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { HttpException, Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';

const EXTRACTION_MAX_TOKENS = 2_000;
const JUDGMENT_MAX_TOKENS = 3_000;
/** Lower than the prompt-injection bar: a contradicting passage is often only loosely similar. */
const KNOWLEDGE_MIN_RELEVANCE = 0.5;

class FactCheckEvidenceError extends Error {}

function isBudgetError(error: unknown): boolean {
  return (
    error instanceof InsufficientCreditsException ||
    error instanceof FreeTrialExpiredException ||
    error instanceof PlanLimitExceededException ||
    (error instanceof HttpException && error.getStatus() === 402)
  );
}

function reasonOf(error: unknown): BrandFactCheckUnavailableReason {
  if (isBudgetError(error)) return 'fact_check_budget_exhausted';
  if (error instanceof LlmStructuredOutputError)
    return 'fact_check_invalid_output';
  if (error instanceof FactCheckEvidenceError)
    return 'fact_check_evidence_unavailable';
  return 'fact_check_unavailable';
}

/**
 * Checks the factual claims of a draft against approved brand evidence only
 * (#6717): the approved Brand OS facts of the snapshot and the brand's
 * authoritative Knowledge sources, retrieved through the same brand-scoped,
 * tenant-scoped path agents use. No web search.
 *
 * A structured model call extracts the claims; a second judges them against
 * the evidence. Every verdict has to cite a real evidence item with a verbatim
 * quote, or it is `unverified`. Both calls run through the LLM dispatcher, so
 * their cost lands in the vendor cost ledger. Anything that cannot run (the
 * provider, the budget, the evidence) is reported as unavailable, never as a
 * result.
 */
@Injectable()
export class BrandFactCheckService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly llm: LlmDispatcherService,
    private readonly knowledge: KnowledgeContentRetrievalService,
    private readonly logger: LoggerService,
  ) {}

  async check(
    actor: BrandedGenerationActorV1,
    request: BrandFactCheckRequest,
  ): Promise<BrandFactCheckOutcome> {
    const { origin, snapshot, text } = request;
    if (
      snapshot.organizationId !== actor.organizationId ||
      snapshot.brandId !== actor.brandId
    )
      return { reasonCode: 'fact_check_scope_mismatch', status: 'unavailable' };
    if (text.length > MAX_FACT_CHECK_TEXT_LENGTH)
      return { reasonCode: 'fact_check_text_too_long', status: 'unavailable' };
    const models = new Set<string>();
    const none: BrandFactCheckOutcome = {
      claims: [],
      knowledgeVersions: [],
      models: [],
      status: 'checked',
    };
    if (!text.trim()) return none;
    try {
      const extraction = await this.extract(actor, text, models);
      if (extraction.claims.length > MAX_FACT_CLAIMS)
        return { reasonCode: 'fact_check_claim_limit', status: 'unavailable' };
      // A claim has to come from the text, or the proof would not be about this draft.
      if (extraction.claims.some((c) => !isQuoteOf(c.quote, text, 1)))
        return {
          reasonCode: 'fact_check_invalid_output',
          status: 'unavailable',
        };
      if (extraction.claims.length === 0)
        return { ...none, models: [...models] };
      const knowledge = await this.retrieve(actor, extraction);
      const evidence = [...brandOsEvidence(snapshot), ...knowledge];
      const judgment = evidence.length
        ? await this.judge(actor, extraction, evidence, models)
        : null;
      return {
        claims: settleFactClaims(extraction, judgment, evidence, origin),
        knowledgeVersions: this.versionsOf(knowledge),
        models: [...models],
        status: 'checked',
      };
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} fact check unavailable: ${getErrorMessage(error)}`,
        { brandId: actor.brandId },
      );
      return { reasonCode: reasonOf(error), status: 'unavailable' };
    }
  }

  private extract(
    actor: BrandedGenerationActorV1,
    text: string,
    models: Set<string>,
  ): Promise<FactExtraction> {
    return this.complete(
      actor,
      buildExtractionMessages(text),
      factExtractionSchema,
      FACT_EXTRACTION_SCHEMA_NAME,
      EXTRACTION_MAX_TOKENS,
      models,
    );
  }

  private judge(
    actor: BrandedGenerationActorV1,
    extraction: FactExtraction,
    evidence: readonly BrandFactEvidenceItem[],
    models: Set<string>,
  ): Promise<FactJudgment> {
    return this.complete(
      actor,
      buildJudgmentMessages(
        extraction.claims.map((claim, index) => ({
          id: `claim-${index + 1}`,
          text: claim.claim,
        })),
        evidence,
      ),
      factJudgmentSchema,
      FACT_JUDGMENT_SCHEMA_NAME,
      JUDGMENT_MAX_TOKENS,
      models,
    );
  }

  private complete<TResult>(
    actor: BrandedGenerationActorV1,
    messages: OpenRouterMessage[],
    schema: ZodType<TResult>,
    schemaName: string,
    maxTokens: number,
    models: Set<string>,
  ): Promise<TResult> {
    return this.llm.completeStructured(
      {
        max_tokens: maxTokens,
        messages,
        model: LLM_DEFAULTS.planning,
        onAttempt: (response) => {
          models.add(response.model ?? LLM_DEFAULTS.planning);
        },
        schema,
        schemaName,
        temperature: 0,
      },
      actor.organizationId,
      { brandId: actor.brandId, userId: actor.actorId },
    );
  }

  /**
   * Authoritative Knowledge passages for each claim, through the brand-scoped
   * retrieval that checks the actor's brand access and the organization.
   */
  private async retrieve(
    actor: BrandedGenerationActorV1,
    extraction: FactExtraction,
  ): Promise<BrandFactEvidenceItem[]> {
    const found = new Map<string, BrandFactEvidenceItem>();
    for (const claim of extraction.claims) {
      let hits: BrandContentMemoryHit[];
      try {
        hits = await this.knowledge.retrieveBrandKnowledge({
          apiKeyId: actor.apiKeyId,
          brandId: actor.brandId,
          isApiKey: actor.isApiKey,
          limit: FACT_PASSAGES_PER_CLAIM,
          minRelevance: KNOWLEDGE_MIN_RELEVANCE,
          organizationId: actor.organizationId,
          query: claim.claim,
          scopes: actor.scopes,
          userId: actor.actorId,
        });
      } catch (error: unknown) {
        throw isBudgetError(error)
          ? error
          : new FactCheckEvidenceError(getErrorMessage(error));
      }
      for (const item of knowledgeEvidence(hits))
        if (found.size < MAX_FACT_KNOWLEDGE_PASSAGES) found.set(item.id, item);
    }
    return [...found.values()];
  }

  private versionsOf(
    evidence: readonly BrandFactEvidenceItem[],
  ): BrandKnowledgeVersionRef[] {
    const versions = new Map<string, BrandKnowledgeVersionRef>();
    for (const item of evidence)
      if (
        item.sourceId !== undefined &&
        item.versionId !== undefined &&
        item.version !== undefined
      )
        versions.set(`${item.sourceId}:${item.versionId}`, {
          sourceId: item.sourceId,
          version: item.version,
          versionId: item.versionId,
        });
    return [...versions.values()];
  }
}
