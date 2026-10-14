import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import {
  readSavedVoiceBinding,
  savedVoiceProviderData,
} from '@api/collections/voices/utils/elevenlabs-voice-binding.schema';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  classifyElevenLabsFailure,
  toElevenLabsActionableError,
} from '@api/services/integrations/elevenlabs/elevenlabs-error.util';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { ElevenLabsConnectionService } from '@api/services/integrations/elevenlabs/services/elevenlabs-connection.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
  VoiceProvider,
} from '@genfeedai/contracts';
import type {
  ElevenLabsAccountVoicePage,
  ElevenLabsConnectionRef,
} from '@genfeedai/contracts/interfaces';
import {
  VoiceProvider as DbVoiceProvider,
  type Prisma,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

/** Voice sources that are saved references to a provider voice. */
const SAVED_REFERENCE_SOURCES = ['imported', 'cloned'];

export type SpeechVoiceSelection = {
  connectionKind: ElevenLabsConnectionRef['kind'];
  externalVoiceId: string;
  internalVoiceId?: string;
};

type SavedVoiceRow = {
  externalVoiceId: string | null;
  externalVoiceCatalogId: string | null;
  id: string;
  isVoiceActive: boolean | null;
  providerData: unknown;
  voiceProvider: string | null;
  voiceSource: string | null;
};

const SAVED_VOICE_SELECT = {
  externalVoiceCatalogId: true,
  externalVoiceId: true,
  id: true,
  isVoiceActive: true,
  providerData: true,
  voiceProvider: true,
  voiceSource: true,
} as const;

/**
 * Personal ElevenLabs voices: browse the connected account, save
 * organization-owned references, and resolve which account speaks a voice.
 * Saved references live in `ingredients` (category VOICE, voiceSource
 * `imported`); the shared ExternalVoice catalog never receives them.
 */
@Injectable()
export class ElevenLabsAccountVoicesService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly connectionService: ElevenLabsConnectionService,
    private readonly elevenLabsService: ElevenLabsService,
    private readonly externalVoiceCatalogService: ExternalVoiceCatalogService,
    private readonly loggerService: LoggerService,
    private readonly sharedService: SharedService,
    private readonly voicesService: VoicesService,
  ) {}

  async browse(
    organizationId: string,
    query: { search?: string; pageToken?: string },
  ): Promise<ElevenLabsAccountVoicePage> {
    const empty = { hasMore: false, nextPageToken: null, voices: [] };
    const connection =
      await this.connectionService.findPersonalConnection(organizationId);
    if (!connection) {
      return { ...empty, connection: { status: 'disconnected' } };
    }

    let page: Awaited<ReturnType<ElevenLabsService['searchAccountVoices']>>;
    try {
      page = await this.elevenLabsService.searchAccountVoices(
        connection.apiKey,
        {
          nextPageToken: query.pageToken,
          search: query.search?.trim() || undefined,
        },
      );
    } catch (error: unknown) {
      if (classifyElevenLabsFailure(error) === 'invalid-credential') {
        return { ...empty, connection: { status: 'invalid' } };
      }
      this.loggerService.error(
        `${this.constructorName} ${CallerUtil.getCallerName()} failed`,
        error,
      );
      throw new ServiceUnavailableException(
        'ElevenLabs voices are unavailable right now. Try again.',
      );
    }

    const saved = await this.findSavedReferences(
      organizationId,
      page.voices.map((voice) => voice.voiceId),
    );
    const savedIds = new Map(
      saved.map((row) => [String(row.externalVoiceId), row.id]),
    );

    return {
      connection: { status: 'connected' },
      hasMore: page.hasMore,
      nextPageToken: page.nextPageToken,
      voices: page.voices.map((voice) => ({
        availability: voice.availability,
        category: voice.category,
        externalVoiceId: voice.voiceId,
        name: voice.name,
        preview: voice.preview,
        restriction: voice.restriction,
        savedVoiceId: savedIds.get(voice.voiceId) ?? null,
      })),
    };
  }

  /**
   * Saves (or re-binds) an organization reference to a voice the connected
   * account can use. Repeated imports return the same reference; the remote
   * voice is never cloned or published.
   */
  async import(
    user: User,
    externalVoiceId: string,
  ): Promise<IngredientDocument> {
    const organizationId = user.organizationId;
    const connection = await this.connectionService.resolve(
      organizationId,
      'byok',
    );

    let voice: Awaited<ReturnType<ElevenLabsService['getAccountVoice']>>;
    try {
      voice = await this.elevenLabsService.getAccountVoice(
        connection.apiKey,
        externalVoiceId,
      );
    } catch (error: unknown) {
      throw toElevenLabsActionableError(error);
    }
    if (voice.availability !== 'available') {
      throw new BadRequestException(
        voice.restriction ?? 'This voice cannot be used yet.',
      );
    }

    const [existing] = await this.findSavedReferences(organizationId, [
      voice.voiceId,
    ]);
    if (existing) {
      await this.voicesService.patchAll(
        { id: existing.id, organizationId },
        {
          providerData: savedVoiceProviderData(
            existing.providerData,
            connection.binding,
            voice.category,
          ),
          ...(existing.voiceSource === 'imported'
            ? { sampleAudioUrl: voice.preview }
            : {}),
        },
      );
      return this.findRequired(existing.id, organizationId);
    }

    const { ingredientData } = await this.sharedService.createMediaDocuments(
      user,
      {
        brandId: user.brandId,
        category: IngredientCategory.VOICE,
        label: voice.name,
        organizationId,
        origin: IngredientOrigin.IMPORTED,
        providerData: savedVoiceProviderData(
          undefined,
          connection.binding,
          voice.category,
        ),
        status: IngredientStatus.GENERATED,
        voiceSource: 'imported',
      },
    );
    const ingredientId = String(ingredientData.id);

    try {
      await this.voicesService.patchAll(
        { id: ingredientId, organizationId },
        {
          externalVoiceId: voice.voiceId,
          isCloned: false,
          isDefaultSelectable: true,
          isVoiceActive: true,
          sampleAudioUrl: voice.preview,
          voiceProvider: VoiceProvider.ELEVENLABS,
        },
      );
    } catch (error: unknown) {
      // A concurrent import of the same voice won the partial unique index
      // `ingredients_org_imported_voice_uidx`; keep its reference.
      if ((error as { code?: unknown })?.code !== 'P2002') {
        throw error;
      }
      await this.voicesService.patchAll(
        { id: ingredientId, organizationId },
        { isDeleted: true },
      );
      const [winner] = await this.findSavedReferences(organizationId, [
        voice.voiceId,
      ]);
      if (!winner) {
        throw error;
      }
      return this.findRequired(winner.id, organizationId);
    }

    return this.findRequired(ingredientId, organizationId);
  }

  /** Removes the local reference only; the remote voice and audio remain. */
  async unlink(
    organizationId: string,
    id: string,
  ): Promise<IngredientDocument | null> {
    const voice = await this.voicesService.findOne({
      category: CategoryPrismaUtil.toIngredientCategory(
        IngredientCategory.VOICE,
      ),
      id,
      isDeleted: false,
      organizationId,
      voiceSource: 'imported',
    });
    if (!voice) {
      return null;
    }
    await this.voicesService.patchAll(
      { id, organizationId },
      { isDeleted: true },
    );
    return voice;
  }

  /**
   * Resolves a speech request's voice to the account that must speak it.
   * Saved references keep their own binding; shared-catalog voices use the
   * platform account. Any other provider id is rejected, so an id alone never
   * grants access to an account's private voices.
   */
  async resolveSpeechVoice(
    organizationId: string,
    voiceId: string,
  ): Promise<SpeechVoiceSelection> {
    const saved =
      (isEntityId(voiceId)
        ? await this.findVoiceRow(organizationId, {
            id: voiceId,
            // Saved voice references only; generated speech assets are not.
            OR: [
              { voiceSource: { in: SAVED_REFERENCE_SOURCES } },
              { isCloned: true },
              { externalVoiceCatalogId: { not: null } },
            ],
          })
        : null) ??
      (await this.findVoiceRow(organizationId, {
        externalVoiceId: voiceId,
        voiceProvider: DbVoiceProvider.ELEVENLABS,
        voiceSource: { in: SAVED_REFERENCE_SOURCES },
      }));

    if (saved) {
      return this.selectionForSavedVoice(organizationId, saved);
    }

    const isCatalogVoice =
      (await this.externalVoiceCatalogService.findActive(
        DbVoiceProvider.ELEVENLABS,
        voiceId,
      )) !== null ||
      (await this.elevenLabsService.isPublicCatalogVoice(voiceId));
    if (!isCatalogVoice) {
      throw new BadRequestException(
        'Choose a voice from your Library, or import it from your ElevenLabs account first.',
      );
    }
    return { connectionKind: 'platform', externalVoiceId: voiceId };
  }

  private async selectionForSavedVoice(
    organizationId: string,
    voice: SavedVoiceRow,
  ): Promise<SpeechVoiceSelection> {
    if (voice.voiceProvider !== VoiceProvider.ELEVENLABS) {
      throw new BadRequestException(
        'This voice is not an ElevenLabs voice and cannot generate speech here.',
      );
    }
    if (!voice.externalVoiceId) {
      throw new BadRequestException('This voice is not ready for speech yet.');
    }
    if (voice.isVoiceActive === false) {
      throw new BadRequestException('This voice is turned off.');
    }

    const binding = readSavedVoiceBinding(voice.providerData);
    if (binding) {
      if (binding.connection.organizationId !== organizationId) {
        throw new BadRequestException(
          'This voice belongs to another organization.',
        );
      }
      return {
        connectionKind: binding.connection.kind,
        externalVoiceId: voice.externalVoiceId,
        internalVoiceId: voice.id,
      };
    }

    // References saved before connection provenance existed: a catalog-backed
    // row speaks through the platform account; a legacy clone through the
    // personal connection when one is configured, as it was created.
    const isPersonal =
      voice.externalVoiceCatalogId === null &&
      (await this.connectionService.findPersonalConnection(organizationId)) !==
        undefined;
    return {
      connectionKind: isPersonal ? 'byok' : 'platform',
      externalVoiceId: voice.externalVoiceId,
      internalVoiceId: voice.id,
    };
  }

  private findVoiceRow(
    organizationId: string,
    where: Prisma.IngredientWhereInput,
  ): Promise<SavedVoiceRow | null> {
    return this.voicesService.prisma.ingredient.findFirst({
      orderBy: { createdAt: 'asc' },
      select: SAVED_VOICE_SELECT,
      where: {
        ...where,
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.VOICE,
        ),
        isDeleted: false,
        organizationId,
      },
    }) as Promise<SavedVoiceRow | null>;
  }

  private findSavedReferences(
    organizationId: string,
    externalVoiceIds: string[],
  ): Promise<SavedVoiceRow[]> {
    if (externalVoiceIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.voicesService.prisma.ingredient.findMany({
      orderBy: { createdAt: 'asc' },
      select: SAVED_VOICE_SELECT,
      // At most one imported and one cloned reference per provider voice.
      take: externalVoiceIds.length * SAVED_REFERENCE_SOURCES.length,
      where: {
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.VOICE,
        ),
        externalVoiceId: { in: externalVoiceIds },
        isDeleted: false,
        organizationId,
        voiceProvider: DbVoiceProvider.ELEVENLABS,
        voiceSource: { in: SAVED_REFERENCE_SOURCES },
      },
    }) as Promise<SavedVoiceRow[]>;
  }

  private async findRequired(
    id: string,
    organizationId: string,
  ): Promise<IngredientDocument> {
    const voice = await this.voicesService.findOne(
      { id, isDeleted: false, organizationId },
      [PopulatePatterns.metadataFull],
    );
    if (!voice) {
      throw new ServiceUnavailableException('Saved voice could not be read.');
    }
    return voice;
  }
}
