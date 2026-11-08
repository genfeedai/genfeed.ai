import type { Readable } from 'node:stream';
import {
  assetCompleteSchema,
  consentRequestSchema,
  directUploadSchema,
  footageProblem,
  HEYGEN_CONSENT_LINK_TTL_MS,
  HEYGEN_TWIN_REQUEST_TIMEOUT_MS,
  HEYGEN_TWIN_UPLOAD_TIMEOUT_MS,
  type HeyGenConsentLink,
  type HeyGenTwinCreated,
  type HeyGenTwinDeleteResult,
  type HeyGenTwinGroup,
  type HeyGenTwinLook,
  mapHeyGenTwinFailure,
  toTwinGroup,
  toTwinLook,
  twinCreateSchema,
  twinGroupSchema,
  twinLookSchema,
} from '@api/services/integrations/heygen/helpers/heygen-twin';
import { HEYGEN_API_ORIGIN } from '@api/services/integrations/heygen/helpers/heygen-video';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { AxiosResponse } from 'axios';
import { isAxiosError } from 'axios';
import { firstValueFrom, type Observable } from 'rxjs';

export interface HeyGenFootageUpload {
  contentType: string;
  filename: string;
  /** Idempotency key for the upload slot; a retry within 24 h reuses it. */
  idempotencyKey?: string;
  sizeBytes: number;
  /**
   * An https URL of a recording this workspace owns. Callers must derive it
   * from a stored asset, never from user input: the API streams from it.
   */
  sourceUrl: string;
}

/**
 * Creates and manages digital-twin avatars in the workspace's own HeyGen
 * account. Every call uses the personal (`byok`) connection: a twin and its
 * consent record belong to the account that created it, so there is no
 * platform fallback.
 */
@Traced()
@Injectable()
export class HeyGenTwinService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly endpoint = `${HEYGEN_API_ORIGIN}/v3`;

  constructor(
    private readonly heyGenService: HeyGenService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {}

  /** Uploads a recording straight to HeyGen storage and returns its asset id. */
  async uploadFootage(
    organizationId: string,
    input: HeyGenFootageUpload,
  ): Promise<{ assetId: string }> {
    const problem = footageProblem(input);
    if (problem) throw new BadRequestException(problem);
    if (!input.sourceUrl.startsWith('https://'))
      throw new BadRequestException('The recording must be an https URL.');
    const apiKey = await this.apiKey(organizationId);

    const slot = directUploadSchema.parse(
      await this.call(
        'post',
        '/assets/direct-uploads',
        apiKey,
        {
          content_type: input.contentType,
          filename: input.filename,
          size_bytes: input.sizeBytes,
        },
        input.idempotencyKey,
      ),
    ).data;

    const source = await firstValueFrom(
      this.httpService.get<Readable>(input.sourceUrl, {
        responseType: 'stream',
        timeout: HEYGEN_TWIN_REQUEST_TIMEOUT_MS,
      }),
    );
    // The presigned PUT carries its own signature: no API key header, and the
    // returned headers must be sent exactly.
    await this.send(() =>
      this.httpService.put<unknown>(slot.upload_url, source.data, {
        headers: {
          ...slot.upload_headers,
          'Content-Length': String(input.sizeBytes),
        },
        maxBodyLength: Number.POSITIVE_INFINITY,
        maxContentLength: Number.POSITIVE_INFINITY,
        timeout: HEYGEN_TWIN_UPLOAD_TIMEOUT_MS,
      }),
    );

    const done = assetCompleteSchema.parse(
      await this.call(
        'post',
        `/assets/${enc(slot.asset_id)}/complete`,
        apiKey,
        {},
      ),
    ).data;
    return { assetId: done.asset_id };
  }

  /**
   * Starts twin training from an uploaded recording. Passing a group adds a
   * look to that character; consent is per group, so it must be the same person.
   */
  async createTwin(
    organizationId: string,
    input: {
      assetId: string;
      avatarGroupId?: string;
      idempotencyKey?: string;
      name: string;
    },
  ): Promise<HeyGenTwinCreated> {
    const apiKey = await this.apiKey(organizationId);
    const created = twinCreateSchema.parse(
      await this.call(
        'post',
        '/avatars',
        apiKey,
        {
          type: 'digital_twin',
          name: input.name,
          file: { type: 'asset_id', asset_id: input.assetId },
          ...(input.avatarGroupId
            ? { avatar_group_id: input.avatarGroupId }
            : {}),
        },
        input.idempotencyKey,
      ),
    ).data;
    return {
      group: toTwinGroup(created.avatar_group),
      look: toTwinLook(created.avatar_item),
    };
  }

  async getLook(
    organizationId: string,
    lookId: string,
  ): Promise<HeyGenTwinLook> {
    const apiKey = await this.apiKey(organizationId);
    return toTwinLook(
      twinLookSchema.parse(
        await this.call('get', `/avatars/looks/${enc(lookId)}`, apiKey),
      ).data,
    );
  }

  async getGroup(
    organizationId: string,
    groupId: string,
  ): Promise<HeyGenTwinGroup> {
    const apiKey = await this.apiKey(organizationId);
    return toTwinGroup(
      twinGroupSchema.parse(
        await this.call('get', `/avatars/${enc(groupId)}`, apiKey),
      ).data,
    );
  }

  /**
   * A link to the provider's page where the person records the consent
   * statement. Valid 24 hours; call again for a new one.
   */
  async requestConsentLink(
    organizationId: string,
    groupId: string,
    input: { idempotencyKey?: string; rerouteUrl?: string } = {},
  ): Promise<HeyGenConsentLink> {
    const apiKey = await this.apiKey(organizationId);
    const requestedAt = Date.now();
    const { avatar_group: group, url } = consentRequestSchema.parse(
      await this.call(
        'post',
        `/avatars/${enc(groupId)}/consent`,
        apiKey,
        input.rerouteUrl ? { reroute_url: input.rerouteUrl } : {},
        input.idempotencyKey,
      ),
    ).data;
    if (!url) throw new Error('HeyGen returned no consent link.');
    return {
      consentUrl: url,
      expiresAt: new Date(requestedAt + HEYGEN_CONSENT_LINK_TTL_MS),
      group: group ? toTwinGroup(group) : null,
    };
  }

  /**
   * Enterprise only: submit a recorded consent video instead of using the
   * webcam page. The provider answers with the group and no link.
   */
  async submitConsentVideo(
    organizationId: string,
    groupId: string,
    input: { assetId: string; idempotencyKey?: string },
  ): Promise<HeyGenTwinGroup> {
    const apiKey = await this.apiKey(organizationId);
    const { avatar_group: group } = consentRequestSchema.parse(
      await this.call(
        'post',
        `/avatars/${enc(groupId)}/consent`,
        apiKey,
        { consent_video: { type: 'asset_id', asset_id: input.assetId } },
        input.idempotencyKey,
      ),
    ).data;
    if (!group) throw new Error('HeyGen returned no avatar group.');
    return toTwinGroup(group);
  }

  /** Makes a voice the character's default (used when a render omits one). */
  async setDefaultVoice(
    organizationId: string,
    groupId: string,
    voiceId: string,
  ): Promise<void> {
    const apiKey = await this.apiKey(organizationId);
    await this.call('patch', `/avatars/${enc(groupId)}`, apiKey, {
      default_voice_id: voiceId,
    });
  }

  /**
   * Deletes the character and, because the provider does not cascade, its
   * source recordings and cloned voices. A resource that is already gone
   * counts as deleted. Every deletion is attempted; failures are reported.
   */
  async deleteTwin(
    organizationId: string,
    input: { assetIds: string[]; groupId: string; voiceIds: string[] },
  ): Promise<HeyGenTwinDeleteResult> {
    const apiKey = await this.apiKey(organizationId);
    const targets = [
      {
        path: `/avatars/${enc(input.groupId)}`,
        resource: `avatar:${input.groupId}`,
      },
      ...input.assetIds.map((id) => ({
        path: `/assets/${enc(id)}`,
        resource: `asset:${id}`,
      })),
      ...input.voiceIds.map((id) => ({
        path: `/models/audio/voices/${enc(id)}`,
        resource: `voice:${id}`,
      })),
    ];
    const result: HeyGenTwinDeleteResult = { deleted: [], failed: [] };
    for (const { path, resource } of targets) {
      try {
        await this.call('delete', path, apiKey);
        result.deleted.push(resource);
      } catch (error: unknown) {
        if (isNotFound(error)) {
          result.deleted.push(resource);
          continue;
        }
        result.failed.push({
          reason: error instanceof Error ? error.message : 'Delete failed.',
          resource,
        });
      }
    }
    return result;
  }

  private async apiKey(organizationId: string): Promise<string> {
    const connection = await this.heyGenService.resolveOrganizationConnection(
      organizationId,
      'byok',
    );
    return connection.apiKey;
  }

  private call(
    method: 'delete' | 'get' | 'patch' | 'post',
    path: string,
    apiKey: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<unknown> {
    const config = {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      timeout: HEYGEN_TWIN_REQUEST_TIMEOUT_MS,
    };
    const url = `${this.endpoint}${path}`;
    return this.send(() => {
      switch (method) {
        case 'get':
          return this.httpService.get<unknown>(url, config);
        case 'delete':
          return this.httpService.delete<unknown>(url, config);
        case 'patch':
          return this.httpService.patch<unknown>(url, body ?? {}, config);
        default:
          return this.httpService.post<unknown>(url, body ?? {}, config);
      }
    });
  }

  /** Runs one request and turns every non-2xx outcome into a readable error. */
  private async send(
    request: () => Observable<AxiosResponse<unknown>>,
  ): Promise<unknown> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    let response: AxiosResponse<unknown>;
    try {
      response = await firstValueFrom(request());
    } catch (error: unknown) {
      if (!isAxiosError(error) || !error.response) {
        this.loggerService.error(`${caller} error`, {
          errorType: error instanceof Error ? error.name : 'Unknown',
        });
        throw error;
      }
      this.loggerService.error(`${caller} error`, {
        status: error.response.status,
      });
      throw mapHeyGenTwinFailure(
        error.response.status,
        error.response.data,
        error.response.headers,
      );
    }
    if (response.status >= 200 && response.status < 300) return response.data;
    this.loggerService.error(`${caller} error`, { status: response.status });
    throw mapHeyGenTwinFailure(
      response.status,
      response.data,
      response.headers,
    );
  }
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    'getStatus' in error &&
    typeof error.getStatus === 'function' &&
    error.getStatus() === 404
  );
}
