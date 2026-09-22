/**
 * Reply-bot comment intent, as a typed decision (#4866, epic #4863).
 *
 * The regex classifier in `reply-intent.util.ts` used to decide on its own
 * whether an auto-reply reached a real person. It still does in `off` mode and
 * whenever the provider cannot answer; what changes here is that a decided
 * intent carries a confidence, and that an *uncertain* comment is neither
 * auto-replied nor auto-skipped — it is queued for a human.
 *
 * Three-way gate, in `live` mode:
 * - confidence ≥ threshold → act on the decided intent;
 * - confidence < threshold, or no answer at all → needs review;
 * - an operator override → their intent, always, over both.
 */

import {
  classifyReplyIntent,
  getReplyIntentPersona,
  isReplyIntent,
} from '@api/services/reply-bot/reply-intent.util';
import {
  REPLY_INTENT_DECISION_POINT,
  REPLY_INTENT_DECISION_TIMEOUT_MS,
  resolveReplyIntentDecisionSettings,
} from '@api/services/reply-bot/reply-intent-decision.settings';
import { TypedDecisionService } from '@api/services/typed-decisions/typed-decision.service';
import type {
  IReplyIntentClassification,
  IReplyIntentClassifyParams,
  ReplyIntent,
  ReplyIntentSource,
} from '@genfeedai/contracts/interfaces';
import { REPLY_INTENT_VALUES } from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/** Bounded so a link dump cannot blow up the decision payload. */
const MAX_COMMENT_CHARS = 1_000;
const MAX_CAPTION_CHARS = 280;
const MAX_HANDLE_CHARS = 120;

/**
 * A link as the provider should see it: a scheme, a `www.` host, a bare domain
 * on a common TLD (`example.com/path`), or a shortener-style two-letter TLD
 * with a path (`t.me/x`, `bit.ly/y`). Prose with a dot in it (`Node.js`,
 * `file.txt`, `great post.in fact`) is not a link. This flag feeds the
 * decision state only — the regex classifier's own link-dump rule stays
 * scheme-only on purpose, because that is the `off` path and it must not move.
 */
const LINK_RE =
  /https?:\/\/\S+|\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|xyz|info|biz|shop|store|link|club|top|vip|win|bet|cash)\b(?:\/\S*)?|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:ai|cc|co|gg|io|ly|me|to|tv|uk|us)\/\S+/i;

/** Whether a comment carries a link, by the rule the decision state uses. */
export function hasCommentLinks(text: string): boolean {
  return LINK_RE.test(text);
}

/**
 * Asked of the state only. The brand's private reply instructions are never
 * part of it — they steer generation, not classification, and they are exactly
 * the kind of tenant secret that must not leave for a hosted classifier.
 */
const REPLY_INTENT_QUESTION =
  'A reader left this comment on the author’s own post. Which reply persona does it call for?';

/** Intents the bot refuses to auto-reply to once a decision picked them. */
const DECIDED_AUTO_SKIP_INTENTS: readonly ReplyIntent[] = ['spam', 'troll'];

/** Narrows a source carried across a workflow boundary as plain JSON. */
export function isReplyIntentSource(
  value: unknown,
): value is ReplyIntentSource {
  return value === 'regex' || value === 'decision' || value === 'human';
}

/**
 * Whether the bot skips the auto-reply for this intent.
 *
 * A decision that picked `spam` or `troll` skips; the regex keeps the persona
 * table's narrower rule (spam only), so `off` mode stays byte-for-byte today's
 * behaviour. One rule, one place — call sites must not re-derive it.
 */
export function isReplyIntentAutoSkip(
  intent: ReplyIntent,
  source: ReplyIntentSource,
): boolean {
  return source === 'decision'
    ? DECIDED_AUTO_SKIP_INTENTS.includes(intent)
    : getReplyIntentPersona(intent).shouldSkipAuto;
}

function truncate(value: string, max: number): string {
  const normalized = value.trim();
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

@Injectable()
export class ReplyIntentClassifierService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly typedDecisionService: TypedDecisionService,
  ) {}

  async classify(
    params: IReplyIntentClassifyParams,
  ): Promise<IReplyIntentClassification> {
    // The operator's own call, over the regex and the provider alike.
    if (isReplyIntent(params.override)) {
      return {
        intent: params.override,
        isAutoSkip: isReplyIntentAutoSkip(params.override, 'human'),
        isNeedsReview: false,
        source: 'human',
      };
    }

    const regexIntent = classifyReplyIntent(params.commentText);
    const settings = resolveReplyIntentDecisionSettings(this.configService);

    if (settings.mode === 'off') {
      return this.deterministic(regexIntent);
    }

    // "WHEN the provider is unavailable THE SYSTEM SHALL behave as `off`"
    // (#4866): a self-host with nothing bound, or an operator who switched the
    // provider off in /admin (#4908), keeps the regex in control rather than
    // queueing every comment for a review no answer could ever have resolved.
    // A *runtime* failure with a provider bound is a different thing, and is
    // treated below exactly like a sub-threshold answer.
    if (!(await this.typedDecisionService.isProviderBound())) {
      return this.deterministic(regexIntent);
    }

    const answer = await this.typedDecisionService.choose<ReplyIntent>(
      {
        options: REPLY_INTENT_VALUES,
        question: REPLY_INTENT_QUESTION,
        state: this.buildState(params),
      },
      {
        ...(params.brandId === undefined ? {} : { brandId: params.brandId }),
        decisionPoint: REPLY_INTENT_DECISION_POINT,
        // What the regex would have said. Shadow-mode agreement is measured
        // from it, and agreement is what gates the flip to `live`.
        deterministicAnswer: regexIntent,
        mode: settings.mode,
        ...(params.organizationId === undefined
          ? {}
          : { organizationId: params.organizationId }),
        ...(params.runId === undefined ? {} : { runId: params.runId }),
        timeoutMs: REPLY_INTENT_DECISION_TIMEOUT_MS,
        ...(params.userId === undefined ? {} : { userId: params.userId }),
      },
    );

    // Shadow mode measures; it never acts. The regex answer stays in control.
    if (settings.mode === 'shadow') {
      return this.deterministic(regexIntent);
    }

    if (answer === null || answer.confidence < settings.minConfidence) {
      this.logger.log(
        `${this.constructorName} intent below threshold — queued for review`,
        {
          confidence: answer?.confidence,
          decisionPoint: REPLY_INTENT_DECISION_POINT,
          deterministicIntent: regexIntent,
          minConfidence: settings.minConfidence,
        },
      );

      return {
        ...(answer === null ? {} : { confidence: answer.confidence }),
        // Best label available for the person who picks this up; the bot acts
        // on neither branch of it.
        intent: regexIntent,
        isAutoSkip: false,
        isNeedsReview: true,
        source: 'regex',
      };
    }

    return {
      confidence: answer.confidence,
      intent: answer.value,
      isAutoSkip: isReplyIntentAutoSkip(answer.value, 'decision'),
      isNeedsReview: false,
      source: 'decision',
    };
  }

  /** Today's path, byte for byte: the regex answer and its persona. */
  private deterministic(intent: ReplyIntent): IReplyIntentClassification {
    return {
      intent,
      isAutoSkip: isReplyIntentAutoSkip(intent, 'regex'),
      isNeedsReview: false,
      source: 'regex',
    };
  }

  private buildState(
    params: IReplyIntentClassifyParams,
  ): Record<string, unknown> {
    return {
      authorHandle: truncate(
        (params.authorHandle ?? '').replace(/^@/, ''),
        MAX_HANDLE_CHARS,
      ),
      comment: truncate(params.commentText, MAX_COMMENT_CHARS),
      hasLinks: hasCommentLinks(params.commentText),
      postCaption: truncate(params.postCaption ?? '', MAX_CAPTION_CHARS),
    };
  }
}
