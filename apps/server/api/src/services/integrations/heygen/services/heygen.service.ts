import { createHash, randomUUID } from 'node:crypto';
import type { AvatarVideoAspectRatio } from '@api/collections/videos/dto/create-avatar-video.dto';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenSubmissionRejectedError } from '@api/services/integrations/heygen/errors/heygen-submission-rejected.error';
import {
  buildHeyGenVideoCreateBody,
  HEYGEN_API_ORIGIN,
  HEYGEN_VIDEO_CREATE_PATH,
  HEYGEN_VIDEO_POLL_INTERVAL_MS,
  HEYGEN_VIDEO_POLL_TIMEOUT_MS,
  type HeyGenVideoCreateBody,
  heyGenVideoStatusUrl,
  isHeyGenVideoTerminal,
  readHeyGenVideoId,
  readHeyGenVideoStatus,
} from '@api/services/integrations/heygen/helpers/heygen-video';
import { heyGenAvatarCandidateSchema } from '@api/services/integrations/heygen/heygen-identity.schema';
import type {
  HeyGenAvatarCandidate,
  ResolvedHeyGenConnection,
} from '@api/services/integrations/heygen/heygen-identity.types';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { ApiKeyCategory, ByokProvider } from '@genfeedai/contracts';
import type {
  HeyGenAvatarRef,
  HeyGenCatalogAvatar,
  HeyGenCatalogVoice,
  HeyGenConnectionRef,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';

const catalogPageSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())),
  has_more: z.boolean(),
  next_token: z.string().nullable(),
});
const voiceSchema = z.object({
  voice_id: z.string().trim().min(1),
  name: z.string(),
  preview_audio_url: z.string().nullish(),
});
const lookSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string(),
  preview_image_url: z.string().nullish(),
  avatar_type: z.string().nullish(),
  group_id: z.string().nullish(),
  supported_api_engines: z.array(z.string()).optional().default([]),
  status: z.string().nullish(),
});
const groupSchema = z.object({
  id: z.string().min(1),
  status: z.string().nullable(),
  consent_status: z.string().nullable(),
});

type HeyGenSpeechInput =
  | string
  | {
      audioUrl?: string;
      inputText?: string;
      voiceId?: string;
    };

@Injectable()
export class HeyGenService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly endpoint = `${HEYGEN_API_ORIGIN}/v3`;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly apiKeyHelperService: ApiKeyHelperService,
    private readonly pollUntilService: PollUntilService,
    private readonly byokService: ByokService,
  ) {}

  private getApiKey(): string {
    return this.apiKeyHelperService.getApiKey(ApiKeyCategory.HEYGEN);
  }

  public async resolveOrganizationConnection(
    organizationId: string,
    kind?: 'byok' | 'platform',
  ): Promise<ResolvedHeyGenConnection> {
    if (kind !== 'platform') {
      const credential = await this.byokService.lookupApiKeyWithIdentity(
        organizationId,
        ByokProvider.HEYGEN,
      );
      if (credential)
        return {
          apiKey: credential.apiKey,
          binding: {
            provider: 'heygen',
            kind: 'byok',
            organizationId,
            credentialVersionId: credential.credentialId,
          },
        };
      if (kind === 'byok')
        throw new BadRequestException(
          'Reconnect your personal HeyGen account to use this identity.',
        );
    }
    const apiKey = this.getApiKey();
    if (!apiKey)
      throw new BadRequestException(
        'The public HeyGen connection is unavailable.',
      );
    return {
      apiKey,
      binding: {
        provider: 'heygen',
        kind: 'platform',
        organizationId,
        credentialVersionId: this.platformCredentialVersion(apiKey),
      },
    };
  }

  public platformCredentialVersion(apiKey: string): string {
    return createHash('sha256')
      .update('heygen-platform-credential:v1\0')
      .update(apiKey)
      .digest('hex');
  }

  private async resolveCredential(
    apiKeyOverride?: string,
    organizationId?: string,
  ) {
    if (apiKeyOverride) return { apiKey: apiKeyOverride, hasCustomKey: true };
    const connection = await this.resolveOrganizationConnection(
      organizationId ?? 'platform',
      organizationId ? undefined : 'platform',
    );
    return {
      apiKey: connection.apiKey,
      hasCustomKey: connection.binding.kind === 'byok',
    };
  }

  private async resolveApiKey(
    apiKeyOverride?: string,
    organizationId?: string,
  ): Promise<string> {
    return (await this.resolveCredential(apiKeyOverride, organizationId))
      .apiKey;
  }

  private getHeaders(apiKey: string) {
    return { 'Content-Type': 'application/json', 'X-Api-Key': apiKey };
  }

  public async generateAvatarVideo(
    metadataId: string,
    avatarId: string,
    voiceId: string,
    inputText: string,
    organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
  ): Promise<string> {
    if (!avatarId.trim() || !voiceId.trim() || !inputText.trim()) {
      throw new BadRequestException('Avatar, voice and script are required');
    }
    const apiKey = await this.resolveApiKey(apiKeyOverride, organizationId);
    return this.submitAvatarVideo(apiKey, {
      type: 'avatar',
      avatar_id: avatarId,
      script: inputText,
      voice_id: voiceId,
      aspect_ratio: '16:9',
      resolution: '720p',
      callback_id: metadataId,
    });
  }

  public async generateNativeAvatarVideo(
    metadataId: string,
    avatarId: string,
    voiceInput: HeyGenSpeechInput,
    apiKey: string,
    aspectRatio: AvatarVideoAspectRatio = '9:16',
  ): Promise<string> {
    const speech =
      typeof voiceInput === 'string' ? { audioUrl: voiceInput } : voiceInput;
    if (
      !avatarId.trim() ||
      !apiKey ||
      (speech.audioUrl && (speech.voiceId || speech.inputText)) ||
      (!speech.audioUrl &&
        (!speech.voiceId?.trim() || !speech.inputText?.trim()))
    )
      throw new BadRequestException(
        'Choose a native avatar and either authorized audio or a voice with script.',
      );
    return this.submitAvatarVideo(apiKey, {
      type: 'avatar',
      avatar_id: avatarId,
      ...(speech.audioUrl
        ? { audio_url: speech.audioUrl }
        : { script: speech.inputText, voice_id: speech.voiceId }),
      aspect_ratio: aspectRatio,
      resolution: aspectRatio === '1:1' ? '1080p' : '720p',
      callback_id: metadataId,
    });
  }

  /** Animate an image directly; trained avatar looks use generateAvatarVideo. */
  public async generatePhotoAvatarVideo(
    metadataId: string,
    photoUrl: string,
    voiceInput: HeyGenSpeechInput,
    organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
    aspectRatio: AvatarVideoAspectRatio = '9:16',
  ): Promise<string> {
    const speech =
      typeof voiceInput === 'string' ? { audioUrl: voiceInput } : voiceInput;
    const audioUrl = speech.audioUrl?.trim();
    if (!photoUrl.trim())
      throw new BadRequestException('A photo URL is required');
    if (!audioUrl && (!speech.voiceId?.trim() || !speech.inputText?.trim())) {
      throw new BadRequestException(
        'Either audioUrl or voiceId with inputText is required for photo avatar generation',
      );
    }
    const apiKey = await this.resolveApiKey(apiKeyOverride, organizationId);
    return this.submitAvatarVideo(apiKey, {
      type: 'image',
      image: { type: 'url', url: photoUrl },
      ...(audioUrl
        ? { audio_url: audioUrl }
        : { script: speech.inputText, voice_id: speech.voiceId }),
      aspect_ratio: aspectRatio,
      resolution: aspectRatio === '1:1' ? '1080p' : '720p',
      callback_id: metadataId,
    });
  }

  private async submitAvatarVideo(
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      // Never automatically retry an ambiguous paid submission.
      const response = await firstValueFrom(
        this.httpService.post<unknown>(`${this.endpoint}/videos`, body, {
          headers: {
            ...this.getHeaders(apiKey),
            'Idempotency-Key': randomUUID(),
          },
          timeout: 30_000,
        }),
      );
      if (response.status === 402) throw new HeyGenSubmissionRejectedError();
      if (response.status !== 200)
        throw new Error('HeyGen API returned non-200 status');
      const videoId = readHeyGenVideoId(response.data);
      if (!videoId)
        throw new Error('HeyGen submission returned no operation identity');
      return videoId;
    } catch (error: unknown) {
      this.loggerService.error(`${caller} error`, {
        errorType: error instanceof Error ? error.name : 'Unknown',
      });
      if (isAxiosError(error) && error.response?.status === 402)
        throw new HeyGenSubmissionRejectedError();
      throw error;
    }
  }

  public async getVoices(
    organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
  ): Promise<HeyGenCatalogVoice[]> {
    const orgId = organizationId ?? 'platform';
    if (apiKeyOverride)
      return this.readVoiceCatalog({
        apiKey: apiKeyOverride,
        binding: { provider: 'heygen', kind: 'byok', organizationId: orgId },
      });
    const voices = await this.readAccessibleCatalog(
      organizationId,
      (connection, ownership) => this.readVoiceCatalog(connection, ownership),
    );
    return voices.map((voice, index) => ({
      ...voice,
      index,
    }));
  }

  private async readVoiceCatalog(
    connection: { apiKey: string; binding: HeyGenConnectionRef },
    ownership?: 'public' | 'private',
  ): Promise<HeyGenCatalogVoice[]> {
    const partitions = ownership
      ? [ownership]
      : connection.binding.kind === 'byok'
        ? (['public', 'private'] as const)
        : (['public'] as const);
    const output: HeyGenCatalogVoice[] = [];
    for (const partition of partitions) {
      const items = await this.getCatalog('/voices', connection.apiKey, 100, {
        type: partition,
      });
      for (const item of items) {
        const voice = voiceSchema.parse(item);
        output.push({
          index: output.length,
          name: voice.name,
          preview: voice.preview_audio_url ?? '',
          voiceId: voice.voice_id,
          ownership: partition,
          connection: this.savedConnection(connection.binding),
        });
      }
    }
    return output;
  }

  public savedConnection(binding: HeyGenConnectionRef): HeyGenConnectionRef {
    return binding.kind === 'platform'
      ? {
          provider: 'heygen',
          kind: 'platform',
          organizationId: binding.organizationId,
        }
      : { ...binding };
  }

  public async getAvatars(
    organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
  ): Promise<HeyGenCatalogAvatar[]> {
    const orgId = organizationId ?? 'platform';
    let avatars: HeyGenAvatarRef[];
    if (apiKeyOverride)
      avatars = await this.readAvatarCatalog({
        apiKey: apiKeyOverride,
        binding: { provider: 'heygen', kind: 'byok', organizationId: orgId },
      });
    else
      avatars = await this.readAccessibleCatalog(
        organizationId,
        (connection, ownership) =>
          this.readAvatarCatalog(connection, ownership),
      );
    return avatars.map((avatarRef, index) => ({
      avatarId: avatarRef.lookId,
      index,
      name: avatarRef.label,
      preview: avatarRef.preview ?? '',
      avatarRef,
    }));
  }

  /** Catalogue sources fail independently; identity admission never falls back. */
  private async readAccessibleCatalog<T>(
    organizationId: string | undefined,
    read: (
      connection: ResolvedHeyGenConnection,
      ownership: 'public' | 'private',
    ) => Promise<T[]>,
  ): Promise<T[]> {
    const orgId = organizationId ?? 'platform';
    // Entitlement/storage failures must not be mistaken for a missing binding.
    const credential = organizationId
      ? await this.byokService.lookupApiKeyWithIdentity(
          orgId,
          ByokProvider.HEYGEN,
        )
      : undefined;
    const platformKey = this.getApiKey();
    if (!organizationId && !platformKey)
      throw new BadRequestException('Connect HeyGen to load identities.');
    const sources: Promise<T[]>[] = [];
    if (platformKey)
      sources.push(
        read(
          {
            apiKey: platformKey,
            binding: {
              provider: 'heygen',
              kind: 'platform',
              organizationId: orgId,
              credentialVersionId: this.platformCredentialVersion(platformKey),
            },
          },
          'public',
        ),
      );
    if (credential)
      sources.push(
        read(
          {
            apiKey: credential.apiKey,
            binding: {
              provider: 'heygen',
              kind: 'byok',
              organizationId: orgId,
              credentialVersionId: credential.credentialId,
            },
          },
          'private',
        ),
      );
    const results = await Promise.allSettled(sources);
    if (
      results.length &&
      results.every((result) => result.status === 'rejected')
    ) {
      const failure = results.find((result) => result.status === 'rejected');
      throw failure?.reason ?? new Error('HeyGen catalogue is unavailable.');
    }
    return results.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : [],
    );
  }

  /** Ownership comes from a filtered provider response, never from missing fields. */
  private async readAvatarCatalog(
    connection: { apiKey: string; binding: HeyGenConnectionRef },
    ownership?: 'public' | 'private',
  ): Promise<HeyGenAvatarRef[]> {
    const partitions = ownership
      ? [ownership]
      : connection.binding.kind === 'byok'
        ? (['public', 'private'] as const)
        : (['public'] as const);
    const output: HeyGenAvatarRef[] = [];
    const groups = new Map<string, Promise<z.infer<typeof groupSchema>>>();
    for (const partition of partitions) {
      if (partition === 'private' && connection.binding.kind !== 'byok')
        throw new BadRequestException(
          'Private avatars require your personal HeyGen connection.',
        );
      const items = await this.getCatalog(
        '/avatars/looks',
        connection.apiKey,
        50,
        { ownership: partition },
      );
      // Five look/group resolutions at a time; groups are deduplicated per request.
      for (let offset = 0; offset < items.length; offset += 5) {
        output.push(
          ...(await Promise.all(
            items.slice(offset, offset + 5).map(async (item) => {
              const look = lookSchema.parse(item);
              let group: z.infer<typeof groupSchema> | undefined;
              let groupUnavailable = false;
              if (partition === 'private' && look.group_id) {
                let pending = groups.get(look.group_id);
                if (!pending) {
                  pending = this.readAvatarGroup(
                    look.group_id,
                    connection.apiKey,
                  );
                  groups.set(look.group_id, pending);
                }
                try {
                  group = await pending;
                } catch {
                  groupUnavailable = true;
                }
              }
              const reason =
                !look.avatar_type ||
                !['studio_avatar', 'digital_twin', 'photo_avatar'].includes(
                  look.avatar_type,
                )
                  ? 'Avatar type could not be verified.'
                  : !look.supported_api_engines.includes('avatar_iv')
                    ? 'This look does not support the default Avatar IV engine.'
                    : partition === 'private' && look.status !== 'completed'
                      ? 'This look has not completed training.'
                      : partition === 'private' &&
                          (groupUnavailable ||
                            (look.group_id &&
                              (!group || group.id !== look.group_id)))
                        ? 'Avatar group readiness could not be verified.'
                        : partition === 'private' &&
                            group &&
                            group.status !== 'completed'
                          ? 'This avatar group is not ready.'
                          : partition === 'private' &&
                              group &&
                              group.consent_status !== null &&
                              group.consent_status !== 'accepted'
                            ? 'Avatar consent is pending or rejected.'
                            : null;
              return {
                version: 1 as const,
                source: 'heygen-look' as const,
                provider: 'heygen' as const,
                lookId: look.id,
                groupId: look.group_id ?? null,
                ownership: partition,
                label: look.name,
                preview: look.preview_image_url ?? null,
                avatarType: look.avatar_type ?? null,
                supportedEngines: look.supported_api_engines,
                readiness: {
                  lookStatus: look.status ?? null,
                  groupStatus: group?.status ?? null,
                  consentStatus: group?.consent_status ?? null,
                  usable: reason === null,
                  reason,
                },
                connection: this.savedConnection(connection.binding),
              };
            }),
          )),
        );
      }
    }
    return output;
  }

  private async readAvatarGroup(groupId: string, apiKey: string) {
    const response = await firstValueFrom(
      this.httpService.get<unknown>(
        `${this.endpoint}/avatars/${encodeURIComponent(groupId)}`,
        { headers: this.getHeaders(apiKey), timeout: 15_000 },
      ),
    );
    return z.object({ data: groupSchema }).parse(response.data).data;
  }

  public async resolveAvatarSelection(
    candidate: HeyGenAvatarCandidate,
    organizationId: string,
  ): Promise<{
    avatarRef: HeyGenAvatarRef;
    connection: ResolvedHeyGenConnection;
  }> {
    const parsed = heyGenAvatarCandidateSchema.safeParse(candidate);
    if (!parsed.success)
      throw new BadRequestException('Select a valid avatar reference.');
    candidate = parsed.data;
    if (
      candidate.connection &&
      candidate.connection.organizationId !== organizationId
    )
      throw new BadRequestException(
        'This avatar belongs to another organization.',
      );
    const connection = await this.resolveOrganizationConnection(
      organizationId,
      candidate.ownership === 'private'
        ? 'byok'
        : (candidate.connection?.kind ?? 'platform'),
    );
    const catalog = await this.readAvatarCatalog(
      connection,
      candidate.ownership,
    );
    const avatarRef = catalog.find(
      (avatar) => avatar.lookId === candidate.lookId,
    );
    if (!avatarRef)
      throw new BadRequestException(
        'The selected avatar is unavailable on this connection. Reselect an avatar.',
      );
    if (candidate.groupId != null && candidate.groupId !== avatarRef.groupId)
      throw new BadRequestException(
        'The selected look does not belong to this avatar group.',
      );
    if (!avatarRef.readiness.usable)
      throw new BadRequestException(
        avatarRef.readiness.reason ?? 'The selected avatar is unavailable.',
      );
    return { avatarRef, connection };
  }

  public async validateVoiceSelection(
    voiceId: string,
    connection: ResolvedHeyGenConnection,
    ownership?: 'public' | 'private',
  ): Promise<HeyGenCatalogVoice> {
    if (ownership === 'private' && connection.binding.kind !== 'byok')
      throw new BadRequestException(
        'Private voices require your personal HeyGen connection.',
      );
    const voices = await this.readVoiceCatalog(connection, ownership);
    const voice = voices.find((candidate) => candidate.voiceId === voiceId);
    if (!voice)
      throw new BadRequestException(
        'The selected HeyGen voice is unavailable on this connection. Reselect a voice.',
      );
    return { ...voice, connection: this.savedConnection(connection.binding) };
  }

  public async getConnectionStatus(organizationId?: string): Promise<{
    hasCustomKey: boolean;
    isConnected: boolean;
    state: 'disconnected' | 'connected' | 'invalid';
  }> {
    if (!organizationId)
      return { hasCustomKey: false, isConnected: false, state: 'disconnected' };
    const credential = await this.byokService.lookupApiKeyWithIdentity(
      organizationId,
      ByokProvider.HEYGEN,
    );
    if (!credential)
      return { hasCustomKey: false, isConnected: false, state: 'disconnected' };
    try {
      await firstValueFrom(
        this.httpService.get(`${this.endpoint}/users/me`, {
          headers: this.getHeaders(credential.apiKey),
          timeout: 15_000,
        }),
      );
      return { hasCustomKey: true, isConnected: true, state: 'connected' };
    } catch (error) {
      if (
        isAxiosError(error) &&
        [401, 403].includes(error.response?.status ?? 0)
      )
        return { hasCustomKey: true, isConnected: false, state: 'invalid' };
      throw error;
    }
  }

  private async getCatalog(
    path: string,
    apiKey: string,
    limit: number,
    filters: Record<string, string> = {},
  ): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    const seenTokens = new Set<string>();
    let token: string | undefined;
    for (let page = 0; page < 100; page++) {
      const response = await firstValueFrom(
        this.httpService.get<unknown>(`${this.endpoint}${path}`, {
          headers: this.getHeaders(apiKey),
          params: { ...filters, limit, ...(token ? { token } : {}) },
          timeout: 15_000,
        }),
      );
      if (response.status !== 200)
        throw new Error('HeyGen API returned non-200 status');
      const data = catalogPageSchema.parse(response.data);
      items.push(...data.data);
      if (!data.has_more) return items;
      if (!data.next_token || seenTokens.has(data.next_token))
        throw new Error('HeyGen returned an invalid catalog cursor');
      token = data.next_token;
      seenTokens.add(token);
    }
    throw new Error('HeyGen catalog exceeded the pagination limit');
  }

  /**
   * HeyGen Video (`heygen-video-1`) on `POST /v3/models/videos`.
   * Polls until the signed `video_url` is ready. Prompt enhancement stays
   * off so the compiled brief is not rewritten.
   */
  public async generateModelVideo(params: {
    apiKeyOverride?: string;
    aspectRatio?: string;
    duration?: number;
    imageUrls?: readonly string[];
    onProviderSubmissionStarted?: () => void;
    prompt: string;
    resolution?: string;
    seed?: number;
    videoUrls?: readonly string[];
  }): Promise<{ videoUrl: string }> {
    const apiKey = await this.resolveApiKey(params.apiKeyOverride);
    const body = this.buildModelVideoBody(params);
    const videoId = await this.submitModelVideo(
      apiKey,
      body,
      params.onProviderSubmissionStarted,
    );
    return this.waitForModelVideo(videoId, apiKey);
  }

  private buildModelVideoBody(params: {
    aspectRatio?: string;
    duration?: number;
    imageUrls?: readonly string[];
    prompt: string;
    resolution?: string;
    seed?: number;
    videoUrls?: readonly string[];
  }): HeyGenVideoCreateBody {
    try {
      return buildHeyGenVideoCreateBody({
        aspectRatio: params.aspectRatio,
        duration: params.duration,
        imageUrls: params.imageUrls ?? [],
        prompt: params.prompt,
        resolution: params.resolution,
        seed: params.seed,
        videoUrls: params.videoUrls ?? [],
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Invalid HeyGen Video request.';
      throw new BadRequestException(message);
    }
  }

  private async submitModelVideo(
    apiKey: string,
    body: HeyGenVideoCreateBody,
    onProviderSubmissionStarted?: () => void,
  ): Promise<string> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      onProviderSubmissionStarted?.();
      const response = await firstValueFrom(
        this.httpService.post(
          `${HEYGEN_API_ORIGIN}${HEYGEN_VIDEO_CREATE_PATH}`,
          body,
          {
            headers: {
              ...this.getHeaders(apiKey),
              'Idempotency-Key': randomUUID(),
            },
          },
        ),
      );
      const videoId = readHeyGenVideoId(response.data);
      if (!videoId) {
        throw new Error('HeyGen Video submission returned no video id.');
      }
      this.loggerService.log(`${caller} submitted ${videoId}`);
      return videoId;
    } catch (error: unknown) {
      if (isAxiosError(error) && error.response?.status === 402) {
        throw new HeyGenSubmissionRejectedError();
      }
      if (error instanceof HeyGenSubmissionRejectedError) {
        throw error;
      }
      this.loggerService.error(`${caller} error`, {
        errorType: error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  }

  private async waitForModelVideo(
    videoId: string,
    apiKey: string,
  ): Promise<{ videoUrl: string }> {
    try {
      const { value } = await this.pollUntilService.poll(
        () => this.readModelVideo(videoId, apiKey),
        (status) => isHeyGenVideoTerminal(status.status),
        {
          intervalMs: HEYGEN_VIDEO_POLL_INTERVAL_MS,
          timeoutMs: HEYGEN_VIDEO_POLL_TIMEOUT_MS,
        },
      );
      if (value.status === 'completed' && value.videoUrl) {
        return { videoUrl: value.videoUrl };
      }
      throw new Error(
        value.failureMessage ||
          `HeyGen Video ${videoId} ended as ${value.status}.`,
      );
    } catch (error: unknown) {
      if (error instanceof PollTimeoutException) {
        throw new Error(
          `HeyGen Video ${videoId} timed out after ${error.timeoutMs}ms.`,
        );
      }
      throw error;
    }
  }

  private async readModelVideo(videoId: string, apiKey: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(heyGenVideoStatusUrl(videoId), {
          headers: this.getHeaders(apiKey),
        }),
      );
      return readHeyGenVideoStatus(response.data);
    } catch (error: unknown) {
      const statusCode = isAxiosError(error)
        ? error.response?.status
        : undefined;
      if (statusCode !== undefined && statusCode < 500) {
        throw error;
      }
      return { status: 'pending' };
    }
  }
}
