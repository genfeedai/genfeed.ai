import type { AvatarTwinActor } from '@api/collections/avatar-twins/services/avatar-twins.service';
import { AvatarTwinsService } from '@api/collections/avatar-twins/services/avatar-twins.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AvatarTwinStatus, VoiceProvider } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import type {
  AgentDigitalTwin,
  AgentDigitalTwinConsentLink,
  AgentToolResult,
} from '@genfeedai/contracts/interfaces';
import type { AvatarTwin } from '@genfeedai/prisma';
import { readString } from '@genfeedai/utils/data/extract.util';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { HttpException, Injectable } from '@nestjs/common';

const DEFAULT_TWIN_NAME = 'My digital twin';
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const MAX_NAME_LENGTH = 64;

const CONSENT_LINK_RETRY_STEP =
  'Ask for the consent link again with transform_media operation digital_twin_consent.';

/** Library filters with no default that mean nothing for twins. */
const LIBRARY_ONLY_PARAMETERS = [
  'characterIds',
  'origin',
  'pageToken',
  'q',
  'shelf',
  'tags',
] as const;

/**
 * Digital twins for the Agent and the MCP (#9688): start one from the
 * caller's own Library recording, hand back HeyGen's consent link, report
 * what HeyGen says about training and consent, and make a ready twin the
 * brand default. Enrollment runs through `AvatarTwinsService`, the same path
 * as the in-app recorder; the camera step itself stays in the app.
 */
@Traced()
@Injectable()
export class AgentAvatarTwinToolHandler {
  constructor(
    private readonly avatarTwins: AvatarTwinsService,
    private readonly brands: BrandsService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /** `get_assets` with `type: digital_twin`. */
  handlesList(toolName: string, params: Record<string, unknown>): boolean {
    return toolName === 'get_assets' && params.type === 'digital_twin';
  }

  /** Lists the caller's twins, or reads one, after asking HeyGen. */
  async list(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const misused = LIBRARY_ONLY_PARAMETERS.filter(
      (key) => params[key] !== undefined && params[key] !== null,
    );
    if (misused.length > 0) {
      return failure(
        `${misused.join(', ')} ${misused.length === 1 ? 'does' : 'do'} not apply to type digital_twin.`,
      );
    }
    const actor = actorOf(ctx);
    const brandDefaultLookId = await this.brandDefaultLookId(
      readString(params.brandId) ?? ctx.brandId,
      ctx.organizationId,
    );
    const twinId = readString(params.twinId);
    if (twinId) {
      try {
        const twin = await this.refreshed(actor, twinId);
        return success({
          twin: toAgentTwin(twin.row, brandDefaultLookId, twin.error),
          type: 'digital_twin',
        });
      } catch (error: unknown) {
        return failure(errorMessage(error, 'The twin could not be read.'));
      }
    }

    const limit = clampLimit(params.limit);
    const rows = (await this.avatarTwins.list(actor)).slice(0, limit);
    const twins: AgentDigitalTwin[] = [];
    for (const row of rows) {
      const twin = isWaiting(row.status)
        ? await this.refreshed(actor, row.id)
        : { row };
      twins.push(toAgentTwin(twin.row, brandDefaultLookId, twin.error));
    }
    return success({
      count: twins.length,
      ...(twins.length === 0
        ? {
            hint: 'No digital twin yet. Record yourself in Genfeed (Library, Avatars, Create my digital twin) or upload a 15 s to 10 min video of yourself, then start one with transform_media operation digital_twin.',
          }
        : {}),
      twins,
      type: 'digital_twin',
    });
  }

  /**
   * `transform_media` `digital_twin`: uploads the recording to the person's
   * own HeyGen account, starts training and asks for a consent link.
   */
  async start(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const videoId = readString(params.videoId)?.trim();
    if (!videoId) {
      return failure('videoId is required for operation digital_twin.');
    }
    const name = (readString(params.name)?.trim() || DEFAULT_TWIN_NAME).slice(
      0,
      MAX_NAME_LENGTH,
    );
    if (
      params.isRecordingKept !== undefined &&
      typeof params.isRecordingKept !== 'boolean'
    ) {
      return failure('isRecordingKept must be a boolean.');
    }
    const actor = actorOf(ctx);

    let twin: AvatarTwin;
    let isExisting = false;
    try {
      const existing = await this.avatarTwins.findActiveBySource(
        actor,
        videoId,
      );
      if (existing) {
        twin = (await this.refreshed(actor, existing.id)).row;
        isExisting = true;
      } else {
        twin = await this.avatarTwins.start(actor, {
          idempotencyKey: idempotencyKeyFor(videoId),
          isRecordingKept: params.isRecordingKept === true,
          name,
          sourceIngredientId: videoId,
        });
      }
    } catch (error: unknown) {
      return failure(
        errorMessage(error, 'The recording could not be sent to HeyGen.'),
      );
    }

    const consent = await this.consentLinkFor(actor, twin, ctx);
    const current = consent.twin ?? twin;
    return success({
      ...(consent.link ? { consentLink: consent.link } : {}),
      ...(consent.error ? { consentLinkError: consent.error } : {}),
      isExisting,
      twin: toAgentTwin(current, null),
    });
  }

  /** `transform_media` `digital_twin_consent`: a fresh 24-hour consent link. */
  async requestConsent(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const twinId = readString(params.twinId)?.trim();
    if (!twinId) {
      return failure('twinId is required for operation digital_twin_consent.');
    }
    const actor = actorOf(ctx);
    try {
      const twin = await this.avatarTwins.get(actor, twinId);
      const link = await this.avatarTwins.requestConsentLink(
        actor,
        twin.id,
        await this.returnPath(ctx),
      );
      const updated = await this.avatarTwins.get(actor, twin.id);
      return success({
        consentLink: toConsentLink(link),
        twin: toAgentTwin(updated, null),
      });
    } catch (error: unknown) {
      return failure(
        errorMessage(error, 'HeyGen did not issue a consent link.'),
      );
    }
  }

  /**
   * `set_generation_settings` with `defaultAvatar`: a READY twin becomes the
   * brand's default avatar and, unless declined, its voice the default voice.
   * Written through the brand agent config, like the in-app "Use for this
   * brand" button, so identity checks are shared.
   */
  async setBrandDefault(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const defaultAvatar = params.defaultAvatar;
    if (
      params.scope !== 'brand' ||
      !defaultAvatar ||
      typeof defaultAvatar !== 'object' ||
      Array.isArray(defaultAvatar)
    ) {
      return failure('defaultAvatar needs scope brand.');
    }
    const { isTwinVoiceUsed, twinId } = defaultAvatar as Record<
      string,
      unknown
    >;
    const id = readString(twinId)?.trim();
    if (!id) {
      return failure('defaultAvatar.twinId is required.');
    }
    if (isTwinVoiceUsed !== undefined && typeof isTwinVoiceUsed !== 'boolean') {
      return failure('defaultAvatar.isTwinVoiceUsed must be a boolean.');
    }
    const brandId = readString(params.brandId) ?? ctx.brandId;
    if (!brandId) {
      return failure('brandId is required for defaultAvatar.');
    }

    const actor = actorOf(ctx);
    let twin: AvatarTwin;
    try {
      twin = (await this.refreshed(actor, id)).row;
    } catch (error: unknown) {
      return failure(errorMessage(error, 'The twin could not be read.'));
    }
    if (twin.status !== AvatarTwinStatus.READY || !twin.providerLookId) {
      return {
        creditsUsed: 0,
        data: { twin: toAgentTwin(twin, null) },
        error: `The twin is not ready yet (status ${twin.status}). ${nextStepFor(twin)}`,
        success: false,
      };
    }

    const isVoiceUsed = isTwinVoiceUsed !== false && Boolean(twin.voiceId);
    try {
      const updated = await this.brands.updateAgentConfig(
        brandId,
        ctx.organizationId,
        {
          // A ref replaces the photo and native avatar defaults on save.
          defaultAvatarRef: {
            groupId: twin.providerGroupId ?? undefined,
            lookId: twin.providerLookId,
            ownership: 'private',
            source: 'heygen-look',
          },
          ...(isVoiceUsed && twin.voiceId
            ? {
                defaultVoiceRef: {
                  externalVoiceId: twin.voiceId,
                  label: twin.name,
                  ownership: 'private',
                  provider: VoiceProvider.HEYGEN,
                  source: 'catalog',
                },
              }
            : {}),
        },
      );
      if (!updated) {
        return failure('Brand was not found in this organization.');
      }
    } catch (error: unknown) {
      return failure(
        errorMessage(error, 'The twin could not be saved on the brand.'),
      );
    }

    return success({
      brandId,
      isVoiceDefault: isVoiceUsed,
      nextStep:
        'Saved. generate type avatar now renders videos with this twin for the brand.',
      twin: toAgentTwin(twin, twin.providerLookId),
    });
  }

  /**
   * Re-reads the twin at HeyGen. A provider error keeps the stored status
   * and says so, instead of failing the whole read.
   */
  private async refreshed(
    actor: AvatarTwinActor,
    id: string,
  ): Promise<{ error?: string; row: AvatarTwin }> {
    try {
      return { row: await this.avatarTwins.refresh(actor, id) };
    } catch (error: unknown) {
      const row = await this.avatarTwins.get(actor, id);
      return {
        error: errorMessage(error, 'HeyGen could not be reached.'),
        row,
      };
    }
  }

  /** Every twin needs consent; ask for the link right after starting. */
  private async consentLinkFor(
    actor: AvatarTwinActor,
    twin: AvatarTwin,
    ctx: ToolExecutionContext,
  ): Promise<{
    error?: string;
    link?: AgentDigitalTwinConsentLink;
    twin?: AvatarTwin;
  }> {
    if (
      twin.status === AvatarTwinStatus.READY ||
      twin.status === AvatarTwinStatus.FAILED ||
      twin.providerConsent === 'accepted' ||
      !twin.providerGroupId
    ) {
      return {};
    }
    try {
      const link = await this.avatarTwins.requestConsentLink(
        actor,
        twin.id,
        await this.returnPath(ctx),
      );
      return {
        link: toConsentLink(link),
        twin: await this.avatarTwins.get(actor, twin.id),
      };
    } catch (error: unknown) {
      return {
        error: `${errorMessage(error, 'HeyGen did not issue a consent link.')} ${CONSENT_LINK_RETRY_STEP}`,
      };
    }
  }

  /** The twin page in the app, inside the brand the call runs for. */
  private async returnPath(ctx: ToolExecutionContext): Promise<string> {
    if (!ctx.brandId) return APP_ROUTES.LIBRARY.AVATAR_TWIN;
    try {
      const brand = await this.prisma.brand.findFirst({
        select: { organization: { select: { slug: true } }, slug: true },
        where: {
          id: ctx.brandId,
          isDeleted: false,
          organizationId: ctx.organizationId,
        },
      });
      const orgSlug = brand?.organization?.slug;
      return orgSlug && brand?.slug
        ? createBrandAppRoute(
            orgSlug,
            brand.slug,
            APP_ROUTES.LIBRARY.AVATAR_TWIN,
          )
        : APP_ROUTES.LIBRARY.AVATAR_TWIN;
    } catch (error: unknown) {
      this.logger.warn('AgentAvatarTwinToolHandler return path unavailable', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return APP_ROUTES.LIBRARY.AVATAR_TWIN;
    }
  }

  private async brandDefaultLookId(
    brandId: string | undefined,
    organizationId: string,
  ): Promise<string | null> {
    if (!brandId) return null;
    const brand = await this.brands.findOne(
      { id: brandId, organizationId },
      'none',
    );
    const config = (brand as { agentConfig?: unknown } | null)?.agentConfig;
    const ref =
      config && typeof config === 'object'
        ? (config as { defaultAvatarRef?: unknown }).defaultAvatarRef
        : undefined;
    return ref && typeof ref === 'object'
      ? (readString((ref as Record<string, unknown>).lookId) ?? null)
      : null;
  }
}

function actorOf(ctx: ToolExecutionContext): AvatarTwinActor {
  return { organizationId: ctx.organizationId, userId: ctx.userId };
}

function isWaiting(status: string): boolean {
  return (
    status === AvatarTwinStatus.TRAINING ||
    status === AvatarTwinStatus.AWAITING_CONSENT
  );
}

function clampLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? Math.floor(value) : DEFAULT_LIMIT;
  return Number.isFinite(parsed)
    ? Math.min(MAX_LIMIT, Math.max(1, parsed))
    : DEFAULT_LIMIT;
}

/**
 * A new enrollment key per start. Repeats from the same recording are caught
 * before this by `findActiveBySource`; a failed twin can be retried. The key
 * only allows `[A-Za-z0-9_-]`.
 */
function idempotencyKeyFor(videoId: string): string {
  return `agent-twin-${videoId.replace(/[^A-Za-z0-9_-]/g, '')}-${Date.now().toString(36)}`.slice(
    0,
    128,
  );
}

function readConsent(value: string | null): AgentDigitalTwin['consent'] {
  return value === 'pending' || value === 'accepted' || value === 'rejected'
    ? value
    : null;
}

/** What the person does next, from what HeyGen last reported. */
export function nextStepFor(twin: AvatarTwin): string {
  const reason = twin.failureMessage ? ` ${twin.failureMessage}` : '';
  const isConsentGiven = twin.providerConsent === 'accepted';
  switch (twin.status as AvatarTwinStatus) {
    case AvatarTwinStatus.UPLOADING:
      return 'HeyGen is still receiving the recording. Not ready yet; check again in a minute.';
    case AvatarTwinStatus.TRAINING:
      return isConsentGiven
        ? 'Consent is accepted and HeyGen is still training the twin, which takes a few minutes. Not ready yet.'
        : 'HeyGen is training the twin, which takes a few minutes. It also needs the consent statement: the person on camera opens the consent link and records it on HeyGen. Not ready yet.';
    case AvatarTwinStatus.AWAITING_CONSENT:
      return isConsentGiven
        ? 'Consent is accepted; HeyGen is finishing the twin. Not ready yet.'
        : 'Training is done. The twin is waiting for consent: the person on camera opens the consent link and records the consent statement on HeyGen. Not ready until HeyGen accepts it. If the link expired, ask for a new one with transform_media operation digital_twin_consent.';
    case AvatarTwinStatus.CONSENT_REJECTED:
      return `HeyGen declined the consent.${reason} ${CONSENT_LINK_RETRY_STEP} Then record the consent statement again.`;
    case AvatarTwinStatus.READY:
      return 'Ready. Make it the brand default with set_generation_settings defaultAvatar, then render a video with generate type avatar.';
    case AvatarTwinStatus.FAILED:
      return `The twin could not be trained.${reason} Record or upload a new take and start again.`;
  }
}

function toAgentTwin(
  twin: AvatarTwin,
  brandDefaultLookId: string | null,
  statusCheckError?: string,
): AgentDigitalTwin {
  const hasFailure = Boolean(twin.failureCode || twin.failureMessage);
  return {
    consent: readConsent(twin.providerConsent),
    consentLinkExpiresAt: twin.consentLinkExpiresAt?.toISOString() ?? null,
    createdAt: twin.createdAt.toISOString(),
    failure: hasFailure
      ? { code: twin.failureCode, message: twin.failureMessage }
      : null,
    id: twin.id,
    isBrandDefault:
      !!twin.providerLookId && twin.providerLookId === brandDefaultLookId,
    name: twin.name,
    nextStep: nextStepFor(twin),
    previewImageUrl: twin.previewImageUrl,
    readyAt: twin.readyAt?.toISOString() ?? null,
    status: twin.status as AvatarTwinStatus,
    ...(statusCheckError ? { statusCheckError } : {}),
    voiceId: twin.voiceId,
  };
}

function toConsentLink(link: {
  consentUrl: string;
  expiresAt: Date;
}): AgentDigitalTwinConsentLink {
  return {
    consentUrl: link.consentUrl,
    expiresAt: link.expiresAt.toISOString(),
  };
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpException || error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}

function success(data: Record<string, unknown>): AgentToolResult {
  return { creditsUsed: 0, data, success: true };
}

function failure(error: string): AgentToolResult {
  return { creditsUsed: 0, error, success: false };
}
