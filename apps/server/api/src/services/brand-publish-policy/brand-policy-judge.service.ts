import { createHash } from 'node:crypto';
import {
  buildPolicyJudgeMessages,
  MAX_POLICY_JUDGE_TEXT_LENGTH,
  POLICY_JUDGE_MAX_TOKENS,
  POLICY_JUDGE_SCHEMA_NAME,
  type PolicyJudgeRules,
  type PolicyJudgment,
  policyJudgmentSchema,
} from '@api/services/brand-publish-policy/brand-policy-judge-prompt.util';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import type { IBrandPolicyViolation } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';

const CACHE_LIMIT = 500;
const CACHE_TTL_MS = 3_600_000;

export interface BrandPolicyJudgeRequest extends PolicyJudgeRules {
  brandId: string;
  organizationId: string;
  text: string;
}

function cacheKey(request: BrandPolicyJudgeRequest): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        request.organizationId,
        request.brandId,
        request.bannedTopics,
        request.bannedClaims,
        request.guardrails,
        request.isModerationRequired,
        request.text,
      ]),
    )
    .digest('hex');
}

function normalizeRule(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

function unavailable(detail: string): IBrandPolicyViolation[] {
  return [{ detail, rule: 'policy_judge_unavailable' }];
}

function toViolation(
  finding: PolicyJudgment['findings'][number],
): IBrandPolicyViolation {
  const evidence = `"${finding.evidence}"`;
  switch (finding.kind) {
    case 'banned_topic':
      return {
        detail: `Touches the banned topic "${finding.rule}": ${evidence}.`,
        rule: 'banned_topic',
      };
    case 'banned_claim':
      return {
        detail: `Makes the banned claim "${finding.rule}": ${evidence}.`,
        rule: 'banned_claim',
      };
    case 'guardrail':
      return {
        detail: `Breaks the brand guardrail "${finding.rule}": ${evidence}.`,
        rule: 'guardrail',
      };
    case 'unsafe':
      return {
        detail: `Caption moderation flagged ${finding.rule}: ${evidence}.`,
        rule: 'required_check',
      };
  }
}

/**
 * The LLM judge of the brand Policy (#7339): banned topics, banned claims,
 * guardrails and, when the Policy requires moderation, the caption's safety.
 * It runs only after every deterministic rule passed, with one small call on
 * the background model, and a verdict is cached per brand, rules and text.
 *
 * It fails closed: an unavailable model, budget or answer is reported as a
 * `policy_judge_unavailable` violation, which holds the draft for review.
 */
@Injectable()
export class BrandPolicyJudgeService {
  private readonly constructorName = String(this.constructor.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; violations: IBrandPolicyViolation[] }
  >();

  constructor(
    private readonly llm: LlmDispatcherService,
    private readonly logger: LoggerService,
  ) {}

  async judge(
    request: BrandPolicyJudgeRequest,
  ): Promise<IBrandPolicyViolation[]> {
    if (!request.text.trim()) return [];
    if (request.text.length > MAX_POLICY_JUDGE_TEXT_LENGTH)
      return unavailable('The draft is too long for the Policy judge to read.');
    const key = cacheKey(request);
    const cached = this.readCache(key);
    if (cached) return cached;

    let judgment: PolicyJudgment;
    try {
      judgment = await this.llm.completeStructured(
        {
          max_tokens: POLICY_JUDGE_MAX_TOKENS,
          messages: buildPolicyJudgeMessages(request.text, request),
          model: LLM_DEFAULTS.background,
          schema: policyJudgmentSchema,
          schemaName: POLICY_JUDGE_SCHEMA_NAME,
          temperature: 0,
        },
        request.organizationId,
        { brandId: request.brandId },
      );
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} Policy judge unavailable: ${getErrorMessage(error)}`,
        { brandId: request.brandId },
      );
      return unavailable(
        'The Policy judge could not check banned topics, claims or moderation.',
      );
    }

    // A finding has to name a listed rule and quote the draft, or it is not about this draft.
    // The rule may come back recased or respaced; the evidence must be exact.
    const listed = {
      banned_claim: new Set(request.bannedClaims.map(normalizeRule)),
      banned_topic: new Set(request.bannedTopics.map(normalizeRule)),
      guardrail: new Set(request.guardrails.map(normalizeRule)),
    };
    const violations = judgment.findings
      .filter(
        (finding) =>
          request.text.includes(finding.evidence) &&
          (finding.kind === 'unsafe'
            ? request.isModerationRequired
            : listed[finding.kind].has(normalizeRule(finding.rule))),
      )
      .map((finding) => {
        const violation = toViolation(finding);
        return { ...violation, detail: violation.detail.slice(0, 500) };
      });
    this.remember(key, violations);
    return violations;
  }

  /** A cached verdict, without calling the model; undefined when there is none. */
  peek(request: BrandPolicyJudgeRequest): IBrandPolicyViolation[] | undefined {
    if (!request.text.trim()) return [];
    return this.readCache(cacheKey(request));
  }

  private readCache(key: string): IBrandPolicyViolation[] | undefined {
    const cached = this.cache.get(key);
    return cached && cached.expiresAt > Date.now()
      ? cached.violations
      : undefined;
  }

  private remember(key: string, violations: IBrandPolicyViolation[]): void {
    if (this.cache.size >= CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, violations });
  }
}
