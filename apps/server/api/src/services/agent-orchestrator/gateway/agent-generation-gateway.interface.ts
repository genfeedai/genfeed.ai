import type { GenerationPlaceholderCreatedCallback } from '@api/common/interfaces/generation-placeholder-lifecycle.interface';
import type { ApprovedGenerationQuoteConstraint } from '@api/helpers/utils/credits/generation-credit-cost.util';
import type { ActivitySource } from '@genfeedai/contracts';
import type {
  JsonApiResult,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';

/**
 * DI token for the in-process generation gateway.
 *
 * `@api` owns the implementation (generation services, guards, and the credit
 * interceptor). Bind it with `useExisting` from the owning module and inject
 * it with `@Inject(AGENT_GENERATION_GATEWAY)` + `import type`.
 */
export const AGENT_GENERATION_GATEWAY = Symbol('AGENT_GENERATION_GATEWAY');

/**
 * Explicit principal for an in-process generation call. Worker turns have no
 * HTTP session, so the caller states who the work runs as and the gateway
 * resolves the full authenticated identity from it.
 */
export interface AgentGenerationPrincipal {
  brandId?: string;
  organizationId: string;
  userId: string;
}

/**
 * Ledger attribution for the calling surface. Pricing, enforcement, and the
 * charged amount stay identical to the HTTP endpoint; only how the resulting
 * credit transaction is labelled changes, so bot spend stays distinguishable
 * from agent spend in cost reporting.
 */
export interface AgentGenerationCreditsAttribution {
  description?: string;
  source?: ActivitySource;
}

export interface AgentGenerationInput {
  /** Retrieved from claimed server-side consent, never copied from body. */
  approvedGenerationQuote?: ApprovedGenerationQuoteConstraint;
  /** Server-owned caller text, before authorized selected context is appended. */
  originalPrompt?: string;
  body: Record<string, unknown>;
  creditsAttribution?: AgentGenerationCreditsAttribution;
  /**
   * Invoked with the durable asset id as soon as the placeholder row exists,
   * before the provider finishes. Only the image and video creation endpoints
   * emit it.
   */
  onPlaceholderCreated?: GenerationPlaceholderCreatedCallback;
  principal: AgentGenerationPrincipal;
}

export interface AgentGenerationResourceInput extends AgentGenerationInput {
  /** Id of the existing asset the operation transforms. */
  resourceId: string;
}

/**
 * One method per billable generation endpoint. Each returns the same JSON:API
 * payload the matching HTTP endpoint returns, so tool handlers keep reading
 * responses through the shared media response readers.
 */
export interface IAgentGenerationGateway {
  generateArticle(input: AgentGenerationInput): Promise<JsonApiResult>;
  generateAvatarVideo(
    input: AgentGenerationInput,
  ): Promise<JsonApiSingleResponse>;
  generateImage(input: AgentGenerationInput): Promise<JsonApiSingleResponse>;
  generateMusic(input: AgentGenerationInput): Promise<JsonApiSingleResponse>;
  generateVideo(input: AgentGenerationInput): Promise<JsonApiSingleResponse>;
  generateVoice(input: AgentGenerationInput): Promise<JsonApiSingleResponse>;
  editImage(
    input: AgentGenerationResourceInput,
  ): Promise<JsonApiSingleResponse>;
  reframeImage(
    input: AgentGenerationResourceInput,
  ): Promise<JsonApiSingleResponse>;
  upscaleImage(
    input: AgentGenerationResourceInput,
  ): Promise<JsonApiSingleResponse>;
}

/**
 * DI token for the in-process video merge gateway. A merge is not a billable
 * generation (local files queue, no provider call), so it has its own seam
 * rather than a method on {@link IAgentGenerationGateway}.
 */
export const AGENT_VIDEO_MERGE_GATEWAY = Symbol('AGENT_VIDEO_MERGE_GATEWAY');

export interface IAgentVideoMergeGateway {
  mergeVideos(input: AgentGenerationInput): Promise<JsonApiSingleResponse>;
}
