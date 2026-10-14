import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ElevenLabsAccountVoicesService } from '@api/collections/voices/services/elevenlabs-account-voices.service';
import type { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import type { VoicesService } from '@api/collections/voices/services/voices.service';
import type { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import type { ElevenLabsConnectionService } from '@api/services/integrations/elevenlabs/services/elevenlabs-connection.service';
import type { SharedService } from '@api/shared/services/shared/shared.service';
import { ElevenLabsError } from '@elevenlabs/elevenlabs-js';
import {
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
  VoiceProvider,
} from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

describe('ElevenLabsAccountVoicesService', () => {
  const organizationId = testId('org');
  const otherOrganizationId = testId('org', 2);
  const savedVoiceId = testId('ingredient');
  const user = {
    brandId: testId('brand'),
    id: 'auth-user-1',
    organizationId,
    userId: testId('user'),
  } as User;
  const binding = (orgId = organizationId) => ({
    credentialVersionId: `credential-${orgId}`,
    kind: 'byok' as const,
    organizationId: orgId,
    provider: 'elevenlabs' as const,
  });
  const accountVoice = (overrides: Record<string, unknown> = {}) => ({
    availability: 'available',
    category: 'cloned',
    name: 'My clone',
    preview: 'https://elevenlabs.example/preview.mp3',
    restriction: null,
    voiceId: 'el-voice-1',
    ...overrides,
  });

  let connections: {
    findPersonalConnection: ReturnType<typeof vi.fn>;
    resolve: ReturnType<typeof vi.fn>;
  };
  let elevenLabs: {
    getAccountVoice: ReturnType<typeof vi.fn>;
    isPublicCatalogVoice: ReturnType<typeof vi.fn>;
    searchAccountVoices: ReturnType<typeof vi.fn>;
  };
  let catalog: { findActive: ReturnType<typeof vi.fn> };
  let shared: { createMediaDocuments: ReturnType<typeof vi.fn> };
  let voices: {
    findOne: ReturnType<typeof vi.fn>;
    patchAll: ReturnType<typeof vi.fn>;
    prisma: {
      ingredient: {
        findFirst: ReturnType<typeof vi.fn>;
        findMany: ReturnType<typeof vi.fn>;
      };
    };
  };
  let service: ElevenLabsAccountVoicesService;

  beforeEach(() => {
    connections = {
      findPersonalConnection: vi.fn(async (orgId: string) => ({
        apiKey: `key-${orgId}`,
        binding: binding(orgId),
      })),
      resolve: vi.fn(async (orgId: string) => ({
        apiKey: `key-${orgId}`,
        binding: binding(orgId),
      })),
    };
    elevenLabs = {
      getAccountVoice: vi.fn().mockResolvedValue(accountVoice()),
      isPublicCatalogVoice: vi.fn().mockResolvedValue(false),
      searchAccountVoices: vi.fn().mockResolvedValue({
        hasMore: true,
        nextPageToken: 'page-2',
        voices: [accountVoice()],
      }),
    };
    catalog = { findActive: vi.fn().mockResolvedValue(null) };
    shared = {
      createMediaDocuments: vi.fn().mockResolvedValue({
        ingredientData: { id: savedVoiceId },
      }),
    };
    voices = {
      findOne: vi.fn().mockResolvedValue({ id: savedVoiceId }),
      patchAll: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      prisma: {
        ingredient: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    };
    service = new ElevenLabsAccountVoicesService(
      connections as unknown as ElevenLabsConnectionService,
      elevenLabs as unknown as ElevenLabsService,
      catalog as unknown as ExternalVoiceCatalogService,
      { error: vi.fn() } as unknown as LoggerService,
      shared as unknown as SharedService,
      voices as unknown as VoicesService,
    );
  });

  describe('browse', () => {
    it('reports a disconnected account without calling ElevenLabs', async () => {
      connections.findPersonalConnection.mockResolvedValue(undefined);

      await expect(service.browse(organizationId, {})).resolves.toEqual({
        connection: { status: 'disconnected' },
        hasMore: false,
        nextPageToken: null,
        voices: [],
      });
      expect(elevenLabs.searchAccountVoices).not.toHaveBeenCalled();
    });

    it('pages the selected account and marks voices it already saved', async () => {
      voices.prisma.ingredient.findMany.mockResolvedValue([
        { externalVoiceId: 'el-voice-1', id: savedVoiceId },
      ]);

      const page = await service.browse(organizationId, {
        pageToken: 'page-1',
        search: '  clone ',
      });

      expect(elevenLabs.searchAccountVoices).toHaveBeenCalledWith(
        `key-${organizationId}`,
        { nextPageToken: 'page-1', search: 'clone' },
      );
      expect(page).toEqual({
        connection: { status: 'connected' },
        hasMore: true,
        nextPageToken: 'page-2',
        voices: [
          {
            availability: 'available',
            category: 'cloned',
            externalVoiceId: 'el-voice-1',
            name: 'My clone',
            preview: 'https://elevenlabs.example/preview.mp3',
            restriction: null,
            savedVoiceId,
          },
        ],
      });
    });

    it('keeps two organizations on their own accounts and saved references', async () => {
      await service.browse(organizationId, {});
      await service.browse(otherOrganizationId, {});

      expect(
        elevenLabs.searchAccountVoices.mock.calls.map(([key]) => key),
      ).toEqual([`key-${organizationId}`, `key-${otherOrganizationId}`]);
      const scopes = voices.prisma.ingredient.findMany.mock.calls.map(
        ([query]) => query.where.organizationId,
      );
      expect(scopes).toEqual([organizationId, otherOrganizationId]);
    });

    it('reports a rejected key as an invalid connection', async () => {
      elevenLabs.searchAccountVoices.mockRejectedValue(
        new ElevenLabsError({ message: 'Unauthorized', statusCode: 401 }),
      );

      await expect(service.browse(organizationId, {})).resolves.toMatchObject({
        connection: { status: 'invalid' },
        voices: [],
      });
    });
  });

  describe('import', () => {
    it('saves an organization-owned reference bound to the personal connection', async () => {
      await service.import(user, 'el-voice-1');

      expect(connections.resolve).toHaveBeenCalledWith(organizationId, 'byok');
      expect(elevenLabs.getAccountVoice).toHaveBeenCalledWith(
        `key-${organizationId}`,
        'el-voice-1',
      );
      expect(shared.createMediaDocuments).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          category: IngredientCategory.VOICE,
          label: 'My clone',
          organizationId,
          origin: IngredientOrigin.IMPORTED,
          providerData: {
            elevenlabs: {
              category: 'cloned',
              connection: binding(),
              version: 1,
            },
          },
          status: IngredientStatus.GENERATED,
          voiceSource: 'imported',
        }),
      );
      expect(voices.patchAll).toHaveBeenCalledWith(
        { id: savedVoiceId, organizationId },
        expect.objectContaining({
          externalVoiceId: 'el-voice-1',
          isCloned: false,
          voiceProvider: VoiceProvider.ELEVENLABS,
        }),
      );
    });

    it('reuses the existing reference on a repeated import', async () => {
      voices.prisma.ingredient.findMany.mockResolvedValue([
        {
          externalVoiceId: 'el-voice-1',
          id: savedVoiceId,
          providerData: { other: true },
          voiceSource: 'imported',
        },
      ]);

      await service.import(user, 'el-voice-1');

      expect(shared.createMediaDocuments).not.toHaveBeenCalled();
      expect(voices.patchAll).toHaveBeenCalledWith(
        { id: savedVoiceId, organizationId },
        {
          providerData: {
            elevenlabs: {
              category: 'cloned',
              connection: binding(),
              version: 1,
            },
            other: true,
          },
          sampleAudioUrl: 'https://elevenlabs.example/preview.mp3',
        },
      );
    });

    it('keeps the first reference when a concurrent import wins the unique index', async () => {
      const winnerId = testId('ingredient', 2);
      voices.prisma.ingredient.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { externalVoiceId: 'el-voice-1', id: winnerId },
        ]);
      voices.patchAll
        .mockRejectedValueOnce(
          Object.assign(new Error('dup'), { code: 'P2002' }),
        )
        .mockResolvedValue({ modifiedCount: 1 });

      await service.import(user, 'el-voice-1');

      expect(voices.patchAll).toHaveBeenCalledWith(
        { id: savedVoiceId, organizationId },
        { isDeleted: true },
      );
      expect(voices.findOne).toHaveBeenLastCalledWith(
        { id: winnerId, isDeleted: false, organizationId },
        expect.any(Array),
      );
    });

    it('refuses a restricted voice and saves nothing', async () => {
      elevenLabs.getAccountVoice.mockResolvedValue(
        accountVoice({
          availability: 'restricted',
          restriction: 'Verify this voice in ElevenLabs before using it.',
        }),
      );

      await expect(service.import(user, 'el-voice-1')).rejects.toThrow(
        'Verify this voice',
      );
      expect(shared.createMediaDocuments).not.toHaveBeenCalled();
    });

    it('requires the personal connection', async () => {
      connections.resolve.mockRejectedValue(
        new BadRequestException(
          'Reconnect your ElevenLabs account to use this voice.',
        ),
      );

      await expect(service.import(user, 'el-voice-1')).rejects.toThrow(
        'Reconnect your ElevenLabs account',
      );
      expect(elevenLabs.getAccountVoice).not.toHaveBeenCalled();
    });

    it('explains a voice the account cannot reach', async () => {
      elevenLabs.getAccountVoice.mockRejectedValue(
        new ElevenLabsError({ message: 'Not found', statusCode: 404 }),
      );

      await expect(service.import(user, 'el-voice-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('unlink', () => {
    it('soft-deletes only the local imported reference', async () => {
      await expect(
        service.unlink(organizationId, savedVoiceId),
      ).resolves.toMatchObject({ id: savedVoiceId });

      expect(voices.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id: savedVoiceId,
          isDeleted: false,
          organizationId,
          voiceSource: 'imported',
        }),
      );
      expect(voices.patchAll).toHaveBeenCalledWith(
        { id: savedVoiceId, organizationId },
        { isDeleted: true },
      );
    });

    it('returns null for a voice that is not an imported reference', async () => {
      voices.findOne.mockResolvedValue(null);

      await expect(
        service.unlink(organizationId, savedVoiceId),
      ).resolves.toBeNull();
      expect(voices.patchAll).not.toHaveBeenCalled();
    });
  });

  describe('resolveSpeechVoice', () => {
    const savedRow = (overrides: Record<string, unknown> = {}) => ({
      externalVoiceCatalogId: null,
      externalVoiceId: 'el-voice-1',
      id: savedVoiceId,
      isVoiceActive: true,
      providerData: {
        elevenlabs: { category: 'cloned', connection: binding(), version: 1 },
      },
      voiceProvider: VoiceProvider.ELEVENLABS,
      voiceSource: 'imported',
      ...overrides,
    });

    it('binds a saved reference by its Library id to its own connection', async () => {
      voices.prisma.ingredient.findFirst.mockResolvedValueOnce(savedRow());

      await expect(
        service.resolveSpeechVoice(organizationId, savedVoiceId),
      ).resolves.toEqual({
        connectionKind: 'byok',
        externalVoiceId: 'el-voice-1',
        internalVoiceId: savedVoiceId,
      });
      expect(voices.prisma.ingredient.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: savedVoiceId,
            isDeleted: false,
            organizationId,
          }),
        }),
      );
    });

    it('binds a provider id the organization saved', async () => {
      voices.prisma.ingredient.findFirst.mockResolvedValueOnce(savedRow());

      await expect(
        service.resolveSpeechVoice(organizationId, 'el-voice-1'),
      ).resolves.toMatchObject({ connectionKind: 'byok' });
    });

    it('uses the platform account only for shared-catalog voices', async () => {
      catalog.findActive.mockResolvedValue({ id: 'catalog-1' });

      await expect(
        service.resolveSpeechVoice(organizationId, 'premade-voice'),
      ).resolves.toEqual({
        connectionKind: 'platform',
        externalVoiceId: 'premade-voice',
      });
    });

    it('rejects a provider id that is neither saved nor public', async () => {
      await expect(
        service.resolveSpeechVoice(organizationId, 'someone-elses-voice'),
      ).rejects.toThrow('import it from your ElevenLabs account');
      expect(elevenLabs.isPublicCatalogVoice).toHaveBeenCalledWith(
        'someone-elses-voice',
      );
    });

    it('rejects a reference bound to another organization', async () => {
      voices.prisma.ingredient.findFirst.mockResolvedValueOnce(
        savedRow({
          providerData: {
            elevenlabs: {
              category: 'cloned',
              connection: binding(otherOrganizationId),
              version: 1,
            },
          },
        }),
      );

      await expect(
        service.resolveSpeechVoice(organizationId, savedVoiceId),
      ).rejects.toThrow('another organization');
    });

    it('rejects a non-ElevenLabs Library voice', async () => {
      voices.prisma.ingredient.findFirst.mockResolvedValueOnce(
        savedRow({ voiceProvider: VoiceProvider.GENFEED_AI }),
      );

      await expect(
        service.resolveSpeechVoice(organizationId, savedVoiceId),
      ).rejects.toThrow('not an ElevenLabs voice');
    });

    it('binds a legacy clone to the personal connection when one exists', async () => {
      voices.prisma.ingredient.findFirst.mockResolvedValueOnce(
        savedRow({ providerData: null, voiceSource: 'cloned' }),
      );

      await expect(
        service.resolveSpeechVoice(organizationId, savedVoiceId),
      ).resolves.toMatchObject({ connectionKind: 'byok' });
    });

    it('keeps a legacy catalog-backed row on the platform account', async () => {
      voices.prisma.ingredient.findFirst.mockResolvedValueOnce(
        savedRow({ externalVoiceCatalogId: 'catalog-1', providerData: null }),
      );

      await expect(
        service.resolveSpeechVoice(organizationId, savedVoiceId),
      ).resolves.toMatchObject({ connectionKind: 'platform' });
    });
  });
});
