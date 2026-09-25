import { randomUUID } from 'node:crypto';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { BadRequestException } from '@nestjs/common';

/**
 * Brand identity awaiting confirmation. `voice` and `niche` travel with the
 * confirmation card payload so the confirmed create can store them as
 * structured agent config instead of folding them into free text.
 */
export type BrandIdentityProposal = {
  description: string;
  label: string;
  niche?: string;
  slug: string;
  voice?: string;
};

const MAX_BRAND_VOICE_OR_NICHE_LENGTH = 500;
const BRAND_IDENTITY_SOURCE_ACTION_ID =
  /^brand-identity-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readBrandRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readBrandString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Strip trailing sentence punctuation and whitespace.
 *
 * A reverse character scan rather than `/[.\s]+$/`: that anchored quantifier
 * backtracks quadratically on a tool parameter ending in a long run of dots
 * or spaces, and these values come straight from agent-supplied params.
 */
export function trimSentenceEnd(value: string): string {
  let end = value.length;
  while (end > 0) {
    const character = value[end - 1];
    if (character !== '.' && character.trim() !== '') {
      break;
    }
    end -= 1;
  }
  return value.slice(0, end);
}

export function readBrandLabel(value: unknown, fallback: string): string {
  const label = typeof value === 'string' ? value.trim() : '';
  const resolved = label || fallback.trim();
  if (!resolved || resolved.length > 120) {
    throw new BadRequestException(
      'Brand label must contain between 1 and 120 characters.',
    );
  }
  return resolved;
}

export function readConfirmedBrandIdentitySourceActionId(
  value: unknown,
): string {
  const sourceActionId = readBrandString(value);
  if (!BRAND_IDENTITY_SOURCE_ACTION_ID.test(sourceActionId)) {
    throw new BadRequestException(
      'Confirmed brand identity changes require valid source action evidence.',
    );
  }
  return sourceActionId;
}

export function readOptionalBrandDescription(
  value: unknown,
  fallback: unknown,
): string {
  const description =
    typeof value === 'string'
      ? value.trim()
      : typeof fallback === 'string'
        ? fallback.trim()
        : '';
  if (description.length > 2_000) {
    throw new BadRequestException(
      'Brand description must not exceed 2000 characters.',
    );
  }
  return description;
}

export function normalizeBrandSlug(value: unknown, label: string): string {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : label;
  const slug = raw
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  if (slug.length < 2 || slug.length > 120) {
    throw new BadRequestException(
      'Brand slug must contain between 2 and 120 URL-safe characters.',
    );
  }
  return slug;
}

/** Optional short brand trait (voice, niche) supplied by the agent. */
export function readOptionalBrandTrait(
  value: unknown,
  field: 'niche' | 'voice',
): string | undefined {
  const trait = readBrandString(value);
  if (!trait) {
    return undefined;
  }
  if (trait.length > MAX_BRAND_VOICE_OR_NICHE_LENGTH) {
    throw new BadRequestException(
      `Brand ${field} must not exceed ${MAX_BRAND_VOICE_OR_NICHE_LENGTH} characters.`,
    );
  }
  return trait;
}

export function buildProposedBrandDescription(
  value: unknown,
  label: string,
  niche: string | undefined,
): string {
  const description = readOptionalBrandDescription(value, undefined);
  if (description) {
    return description;
  }

  return niche
    ? `Brand profile for ${label}, focused on ${trimSentenceEnd(niche)}.`
    : `Brand profile for ${label}`;
}

/**
 * Reads the create_brand identity proposal from agent params. A confirmed
 * create keeps the description it was shown; a proposal derives one from
 * the niche when the agent supplied none.
 */
export function readCreateBrandProposal(
  params: Record<string, unknown>,
  isConfirmed: boolean,
): BrandIdentityProposal {
  const label = readBrandLabel(
    params.label ?? params.name ?? params.brandName,
    'My Brand',
  );
  const slug = normalizeBrandSlug(params.slug ?? params.handle, label);
  const niche = readOptionalBrandTrait(params.niche, 'niche');
  const voice = readOptionalBrandTrait(params.voice, 'voice');
  const description = isConfirmed
    ? readOptionalBrandDescription(
        params.description,
        `Brand profile for ${label}`,
      )
    : buildProposedBrandDescription(params.description, label, niche);
  return {
    description,
    label,
    ...(niche ? { niche } : {}),
    slug,
    ...(voice ? { voice } : {}),
  };
}

/**
 * Agent config for a confirmed create: identity-confirmation provenance plus
 * the structured fields the agent brand context renders as Brand Voice and
 * Content Strategy. `Brand.text` stays reserved for guidelines.
 */
export function buildCreatedBrandAgentConfig(
  proposal: BrandIdentityProposal,
  sourceActionId: string,
): Record<string, unknown> {
  return {
    brandIdentityConfirmation: {
      createSourceActionId: sourceActionId,
      requestedSlug: proposal.slug,
      source: 'agent-thread-ui-action',
    },
    ...(proposal.niche ? { strategy: { topics: [proposal.niche] } } : {}),
    ...(proposal.voice ? { voice: { tone: proposal.voice } } : {}),
  };
}

export function isMatchingCreateRecovery(
  brand: Record<string, unknown> | null,
  proposal: BrandIdentityProposal,
  sourceActionId: string,
  ctx: ToolExecutionContext,
): brand is Record<string, unknown> {
  if (!brand) {
    return false;
  }
  const agentConfig = readBrandRecord(brand.agentConfig);
  const provenance = readBrandRecord(agentConfig.brandIdentityConfirmation);
  return (
    provenance.createSourceActionId === sourceActionId &&
    provenance.requestedSlug === proposal.slug &&
    brand.organizationId === ctx.organizationId &&
    brand.userId === ctx.userId &&
    brand.label === proposal.label &&
    brand.description === proposal.description
  );
}

export function buildRecoveredCreateResult(
  brand: Record<string, unknown>,
  proposal: BrandIdentityProposal,
): AgentToolResult {
  return {
    creditsUsed: 0,
    data: {
      brandId: String(brand.id),
      created: false,
      id: String(brand.id),
      label: proposal.label,
      recovered: true,
      slug: readBrandString(brand.slug) || proposal.slug,
    },
    success: true,
  };
}

/** The confirmation card a create or rename proposal returns to the thread. */
export function buildBrandIdentityProposal(
  operation: 'create' | 'rename',
  proposal: BrandIdentityProposal,
  ctx: ToolExecutionContext,
  currentIdentity?: { label: string; slug: string },
): AgentToolResult {
  const sourceActionId = `brand-identity-${randomUUID()}`;
  const action =
    operation === 'create' ? 'confirm_create_brand' : 'confirm_rename_brand';
  const label = operation === 'create' ? 'Confirm create' : 'Confirm rename';

  return {
    creditsUsed: 0,
    data: {
      operation,
      proposal,
      sourceActionId,
    },
    nextActions: [
      {
        ctas: [
          {
            action,
            label,
            payload: {
              ...proposal,
              sourceActionId,
            },
          },
        ],
        data: {
          ...(currentIdentity ? { currentIdentity } : {}),
          operation,
          proposal,
          proposalScope: {
            brandId: ctx.validatedScope?.brandId ?? null,
            contextVersion: ctx.validatedScope?.contextVersion ?? null,
          },
          sourceActionId,
        },
        description:
          operation === 'create'
            ? 'Review the proposed identity before creating the brand.'
            : 'Review the proposed identity before renaming the active brand.',
        id: sourceActionId,
        requiresConfirmation: true,
        riskLevel: 'medium',
        title:
          operation === 'create'
            ? 'Confirm brand creation'
            : 'Confirm brand rename',
        type: 'brand_identity_confirmation_card',
      },
    ],
    requiresConfirmation: true,
    riskLevel: 'medium',
    success: true,
  };
}
