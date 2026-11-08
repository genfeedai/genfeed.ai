import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ElevenLabsAccountVoicesService } from '@api/collections/voices/services/elevenlabs-account-voices.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { scopedWhere } from '@api/index';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { IngredientCategory, VoiceProvider } from '@genfeedai/contracts';
import type {
  AgentSavedVoice,
  AgentToolResult,
} from '@genfeedai/contracts/interfaces';
import { readString } from '@genfeedai/utils/data/extract.util';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, Injectable } from '@nestjs/common';

/** Saved personal voices: imported from, or cloned in, the organization's own account. */
const SAVED_VOICE_SOURCES = ['imported', 'cloned'];

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const CONNECT_ACCOUNT_HINT =
  'No ElevenLabs account is connected. Personal voices come only from the account your organization connects in Genfeed; connect it there, then browse it again. Stock catalog voices still work for generate type voice.';

const NO_SAVED_VOICE_HINT =
  'No personal voice is saved yet. Browse the connected account with get_assets type voice source account, then save one with set_generation_settings defaultVoice.';

type SavedVoiceRow = {
  externalVoiceId: string | null;
  id: string;
  label: string | null;
  sampleAudioUrl: string | null;
  voiceProvider: string | null;
  voiceSource: string | null;
};

function clampInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = typeof value === 'number' ? Math.floor(value) : fallback;
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

/** The brand's default voice reference, as stored in its agent config. */
function readBrandDefaultVoice(brand: unknown): {
  externalVoiceId?: string;
  internalVoiceId?: string;
} {
  const config = (brand as { agentConfig?: unknown } | null)?.agentConfig;
  const ref =
    config && typeof config === 'object'
      ? (config as { defaultVoiceRef?: unknown }).defaultVoiceRef
      : undefined;
  if (!ref || typeof ref !== 'object') return {};
  const { externalVoiceId, internalVoiceId } = ref as Record<string, unknown>;
  return {
    externalVoiceId: readString(externalVoiceId),
    internalVoiceId: readString(internalVoiceId),
  };
}

/**
 * Personal voices for the MCP and the Agent: list what the organization saved,
 * browse the account it connected, and make a saved voice the brand default.
 * Voices are organization-owned and come only from the customer's own
 * connected account; nothing here reads or falls back to a platform account.
 */
@Traced()
@Injectable()
export class AgentVoiceToolHandler {
  constructor(
    private readonly accountVoices: ElevenLabsAccountVoicesService,
    private readonly brands: BrandsService,
    private readonly voices: VoicesService,
  ) {}

  /** `get_assets` with `type: voice`. */
  handlesList(toolName: string, params: Record<string, unknown>): boolean {
    return toolName === 'get_assets' && params.type === 'voice';
  }

  async list(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const source = params.source ?? 'saved';
    if (source !== 'saved' && source !== 'account') {
      return this.failure('source must be saved or account.');
    }
    const misused = (
      source === 'saved'
        ? ['pageToken', 'q']
        : ['limit', 'offset', 'origin', 'shelf', 'tagMatch', 'tags']
    ).filter((key) => params[key] !== undefined && params[key] !== null);
    if (misused.length > 0) {
      return this.failure(
        `${misused.join(', ')} do not apply to type voice with source ${source}.`,
      );
    }
    return source === 'account'
      ? this.browseAccount(params, ctx)
      : this.listSaved(params, ctx);
  }

  /** Saved voices for `get_generation_options type=voice`. */
  async summarize(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<{
    hasConnectedAccount: boolean;
    hint?: string;
    voices: AgentSavedVoice[];
  }> {
    const brandId = readString(params.brandId) ?? ctx.brandId;
    const [voices, hasConnectedAccount] = await Promise.all([
      this.savedVoices(ctx.organizationId, brandId, MAX_LIMIT, 0),
      this.accountVoices.hasPersonalConnection(ctx.organizationId),
    ]);
    return {
      hasConnectedAccount,
      ...(voices.length === 0
        ? {
            hint: hasConnectedAccount
              ? NO_SAVED_VOICE_HINT
              : CONNECT_ACCOUNT_HINT,
          }
        : {}),
      voices,
    };
  }

  /**
   * `set_generation_settings` with `defaultVoice`: saves a voice from the
   * connected account when needed, then makes it the brand default.
   */
  async setBrandDefault(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const defaultVoice = params.defaultVoice;
    if (
      params.scope !== 'brand' ||
      !defaultVoice ||
      typeof defaultVoice !== 'object' ||
      Array.isArray(defaultVoice)
    ) {
      throw new BadRequestException('defaultVoice needs scope brand.');
    }
    const brandId = readString(params.brandId) ?? ctx.brandId;
    if (!brandId) {
      throw new BadRequestException('brandId is required for defaultVoice.');
    }
    const { externalVoiceId, voiceId } = defaultVoice as Record<
      string,
      unknown
    >;
    if (Boolean(readString(voiceId)) === Boolean(readString(externalVoiceId))) {
      throw new BadRequestException(
        'Pass exactly one of voiceId or externalVoiceId.',
      );
    }

    const brand = await this.brands.findOne(
      { id: brandId, organizationId: ctx.organizationId },
      'none',
    );
    if (!brand) {
      return this.failure('Brand was not found in this organization.');
    }

    const saved = readString(externalVoiceId)
      ? await this.importFromAccount(ctx, brandId, String(externalVoiceId))
      : await this.findSaved(ctx.organizationId, String(voiceId));
    if (!saved?.externalVoiceId) {
      return this.failure(
        'That voice is not saved in this organization. List saved voices with get_assets type voice.',
      );
    }

    await this.brands.updateAgentConfig(brandId, ctx.organizationId, {
      defaultVoiceRef: {
        externalVoiceId: saved.externalVoiceId,
        internalVoiceId: saved.id,
        label: saved.label ?? undefined,
        preview: saved.sampleAudioUrl,
        provider: VoiceProvider.ELEVENLABS,
        source: 'cloned',
      },
    });
    return {
      creditsUsed: 0,
      data: {
        brandId,
        defaultVoice: this.toSavedVoice(saved, true),
      },
      success: true,
    };
  }

  private async listSaved(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brandId = readString(params.brandId) ?? ctx.brandId;
    const voices = await this.savedVoices(
      ctx.organizationId,
      brandId,
      clampInteger(params.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
      clampInteger(params.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    );
    const hasConnectedAccount = await this.accountVoices.hasPersonalConnection(
      ctx.organizationId,
    );
    return {
      creditsUsed: 0,
      data: {
        count: voices.length,
        hasConnectedAccount,
        ...(voices.length === 0
          ? {
              hint: hasConnectedAccount
                ? NO_SAVED_VOICE_HINT
                : CONNECT_ACCOUNT_HINT,
            }
          : {}),
        source: 'saved',
        type: 'voice',
        voices,
      },
      success: true,
    };
  }

  private async browseAccount(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const page = await this.accountVoices.browse(ctx.organizationId, {
      pageToken: readString(params.pageToken),
      search: readString(params.q),
    });
    const status = page.connection.status;
    return {
      creditsUsed: 0,
      data: {
        connection: page.connection,
        hasMore: page.hasMore,
        ...(status === 'connected' ? {} : { hint: CONNECT_ACCOUNT_HINT }),
        nextPageToken: page.nextPageToken,
        source: 'account',
        type: 'voice',
        voices: page.voices.map((voice) => ({
          availability: voice.availability,
          category: voice.category,
          externalVoiceId: voice.externalVoiceId,
          name: voice.name,
          previewUrl: voice.preview,
          restriction: voice.restriction,
          savedVoiceId: voice.savedVoiceId,
        })),
      },
      success: true,
    };
  }

  private async importFromAccount(
    ctx: ToolExecutionContext,
    brandId: string,
    externalVoiceId: string,
  ): Promise<SavedVoiceRow> {
    const user: AuthenticatedUser = {
      brandId,
      id: ctx.userId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    };
    const voice = await this.accountVoices.import(user, externalVoiceId);
    return {
      externalVoiceId: voice.externalVoiceId ?? externalVoiceId,
      id: String(voice.id),
      label: voice.label ?? null,
      sampleAudioUrl: voice.sampleAudioUrl ?? null,
      voiceProvider: voice.voiceProvider ?? VoiceProvider.ELEVENLABS,
      voiceSource: voice.voiceSource ?? 'imported',
    };
  }

  private findSaved(
    organizationId: string,
    voiceId: string,
  ): Promise<SavedVoiceRow | null> {
    return this.voices.prisma.ingredient.findFirst({
      select: this.select(),
      where: scopedWhere(organizationId, {
        ...this.savedWhere(),
        id: voiceId,
      }),
    }) as Promise<SavedVoiceRow | null>;
  }

  private async savedVoices(
    organizationId: string,
    brandId: string | undefined,
    limit: number,
    offset: number,
  ): Promise<AgentSavedVoice[]> {
    const [rows, brand] = await Promise.all([
      this.voices.prisma.ingredient.findMany({
        orderBy: { createdAt: 'desc' },
        select: this.select(),
        skip: offset,
        take: limit,
        where: scopedWhere(organizationId, this.savedWhere()),
      }) as Promise<SavedVoiceRow[]>,
      brandId
        ? this.brands.findOne({ id: brandId, organizationId }, 'none')
        : null,
    ]);
    const defaults = readBrandDefaultVoice(brand);
    return rows.map((row) =>
      this.toSavedVoice(
        row,
        row.id === defaults.internalVoiceId ||
          (row.externalVoiceId !== null &&
            row.externalVoiceId === defaults.externalVoiceId),
      ),
    );
  }

  private select() {
    return {
      externalVoiceId: true,
      id: true,
      label: true,
      sampleAudioUrl: true,
      voiceProvider: true,
      voiceSource: true,
    } as const;
  }

  private savedWhere() {
    return {
      category: IngredientCategory.VOICE,
      OR: [{ isVoiceActive: null }, { isVoiceActive: true }],
      voiceSource: { in: SAVED_VOICE_SOURCES },
    };
  }

  private toSavedVoice(
    row: SavedVoiceRow,
    isBrandDefault: boolean,
  ): AgentSavedVoice {
    return {
      externalVoiceId: row.externalVoiceId,
      id: row.id,
      isBrandDefault,
      name: row.label ?? 'Untitled voice',
      previewUrl: row.sampleAudioUrl,
      provider: row.voiceProvider,
      source: row.voiceSource === 'cloned' ? 'cloned' : 'imported',
    };
  }

  private failure(error: string): AgentToolResult {
    return { creditsUsed: 0, error, success: false };
  }
}
