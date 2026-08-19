import type {
  BotDocument,
  BotLivestreamMessageTemplate,
  BotLivestreamMessageType,
  BotTarget,
} from '@api/collections/bots/schemas/bot.schema';
import type {
  LivestreamBotSessionData,
  LivestreamBotSessionDocument,
  LivestreamDeliveryRecord,
  LivestreamPlatformState,
  LivestreamSessionContext,
  LivestreamTranscriptChunk,
} from '@api/collections/bots/schemas/livestream-bot-session.schema';
import { Prisma } from '@genfeedai/prisma';

function isLivestreamMessageType(
  messageType: string,
): messageType is BotLivestreamMessageType {
  return (
    messageType === 'scheduled_link_drop' ||
    messageType === 'scheduled_host_prompt' ||
    messageType === 'context_aware_question'
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeJsonPayload(
  target: Record<string, unknown>,
  source: unknown,
): void {
  if (!isPlainObject(source)) {
    return;
  }

  for (const [key, value] of Object.entries(source)) {
    if (target[key] === undefined) {
      target[key] = value;
    }
  }
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toJsonCompatible(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonCompatible(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, toJsonCompatible(entryValue)]),
    );
  }

  return value;
}

export function mergeLivestreamSessionContext(
  current: LivestreamSessionContext | undefined,
  patch: Partial<LivestreamSessionContext>,
): LivestreamSessionContext {
  return {
    ...(current ?? { source: 'none' }),
    ...patch,
    source: patch.source ?? current?.source ?? 'none',
  };
}

export function normalizeLivestreamBotDocument(bot: BotDocument): BotDocument {
  const normalized = { ...bot } as Record<string, unknown>;

  mergeJsonPayload(normalized, normalized.config);
  mergeJsonPayload(normalized, normalized.settings);

  normalized.targets = Array.isArray(normalized.targets)
    ? normalized.targets.flatMap((target) => {
        if (!isPlainObject(target)) {
          return [];
        }

        if (
          typeof target.platform !== 'string' ||
          typeof target.channelId !== 'string'
        ) {
          return [];
        }

        return [
          {
            channelId: target.channelId,
            channelLabel:
              typeof target.channelLabel === 'string'
                ? target.channelLabel
                : undefined,
            channelUrl:
              typeof target.channelUrl === 'string'
                ? target.channelUrl
                : undefined,
            credentialId:
              typeof target.credentialId === 'string'
                ? target.credentialId
                : undefined,
            isEnabled:
              typeof target.isEnabled === 'boolean'
                ? target.isEnabled
                : undefined,
            liveChatId:
              typeof target.liveChatId === 'string'
                ? target.liveChatId
                : undefined,
            platform: target.platform,
            senderId:
              typeof target.senderId === 'string' ? target.senderId : undefined,
          } satisfies BotTarget,
        ];
      })
    : [];

  if (isPlainObject(normalized.livestreamSettings)) {
    const livestreamSettings = {
      ...normalized.livestreamSettings,
    } as Record<string, unknown>;

    livestreamSettings.links = Array.isArray(livestreamSettings.links)
      ? livestreamSettings.links.flatMap((link) => {
          if (
            !isPlainObject(link) ||
            typeof link.id !== 'string' ||
            typeof link.label !== 'string' ||
            typeof link.url !== 'string'
          ) {
            return [];
          }

          return [
            {
              ...link,
              id: link.id,
              label: link.label,
              url: link.url,
            },
          ];
        })
      : [];

    livestreamSettings.messageTemplates = Array.isArray(
      livestreamSettings.messageTemplates,
    )
      ? livestreamSettings.messageTemplates.flatMap((template) => {
          if (
            !isPlainObject(template) ||
            typeof template.id !== 'string' ||
            typeof template.text !== 'string' ||
            typeof template.type !== 'string' ||
            !isLivestreamMessageType(template.type)
          ) {
            return [];
          }

          return [
            {
              ...template,
              enabled:
                typeof template.enabled === 'boolean'
                  ? template.enabled
                  : undefined,
              id: template.id,
              platforms: Array.isArray(template.platforms)
                ? template.platforms.filter(
                    (platform): platform is string =>
                      typeof platform === 'string',
                  )
                : undefined,
              text: template.text,
              type: template.type,
            } satisfies BotLivestreamMessageTemplate,
          ];
        })
      : [];

    normalized.livestreamSettings = livestreamSettings;
  }

  // JSON-backed Prisma rows are narrowed field by field above before rejoining
  // the application document contract.
  return normalized as BotDocument;
}

function normalizeLivestreamSessionContext(
  context: unknown,
): LivestreamSessionContext {
  const normalized = isPlainObject(context)
    ? { ...context }
    : ({} as Record<string, unknown>);
  const manualOverride = isPlainObject(normalized.manualOverride)
    ? { ...normalized.manualOverride }
    : undefined;

  if (manualOverride) {
    const expiresAt = toDate(manualOverride.expiresAt);

    if (expiresAt) {
      manualOverride.expiresAt = expiresAt;
    } else {
      delete manualOverride.expiresAt;
    }
  }

  return {
    ...normalized,
    manualOverride,
    source:
      normalized.source === 'manual_override' ||
      normalized.source === 'transcript' ||
      normalized.source === 'none'
        ? normalized.source
        : 'none',
  };
}

export function normalizeLivestreamSessionDocument(
  session: Record<string, unknown>,
): LivestreamBotSessionDocument {
  const normalized = { ...session };

  mergeJsonPayload(normalized, normalized.data);

  normalized.context = normalizeLivestreamSessionContext(normalized.context);
  normalized.platformStates = Array.isArray(normalized.platformStates)
    ? normalized.platformStates.flatMap((platformState) => {
        if (
          !isPlainObject(platformState) ||
          typeof platformState.platform !== 'string'
        ) {
          return [];
        }

        return [
          {
            ...platformState,
            hourlyPostCount:
              typeof platformState.hourlyPostCount === 'number'
                ? platformState.hourlyPostCount
                : 0,
            hourWindowStartedAt: toDate(platformState.hourWindowStartedAt),
            lastError:
              typeof platformState.lastError === 'string'
                ? platformState.lastError
                : undefined,
            lastPostedAt: toDate(platformState.lastPostedAt),
            platform: platformState.platform,
          } satisfies LivestreamPlatformState,
        ];
      })
    : [];
  normalized.deliveryHistory = Array.isArray(normalized.deliveryHistory)
    ? normalized.deliveryHistory.flatMap((record) => {
        if (
          !isPlainObject(record) ||
          typeof record.id !== 'string' ||
          typeof record.message !== 'string' ||
          typeof record.platform !== 'string' ||
          typeof record.status !== 'string' ||
          typeof record.type !== 'string'
        ) {
          return [];
        }

        return [
          {
            ...record,
            createdAt: toDate(record.createdAt),
            id: record.id,
            message: record.message,
            platform: record.platform,
            reason:
              typeof record.reason === 'string' ? record.reason : undefined,
            status: record.status === 'failed' ? 'failed' : 'sent',
            targetId:
              typeof record.targetId === 'string' ? record.targetId : undefined,
            // Historical persisted rows accepted arbitrary string values here;
            // hydration preserves that compatibility contract.
            type: record.type as BotLivestreamMessageType,
          } satisfies LivestreamDeliveryRecord,
        ];
      })
    : [];
  normalized.transcriptChunks = Array.isArray(normalized.transcriptChunks)
    ? normalized.transcriptChunks.flatMap((chunk) => {
        if (!isPlainObject(chunk) || typeof chunk.text !== 'string') {
          return [];
        }

        return [
          {
            ...chunk,
            confidence:
              typeof chunk.confidence === 'number'
                ? chunk.confidence
                : undefined,
            createdAt: toDate(chunk.createdAt),
            text: chunk.text,
          } satisfies LivestreamTranscriptChunk,
        ];
      })
    : [];
  normalized.lastTranscriptAt = toDate(normalized.lastTranscriptAt) ?? null;
  normalized.pausedAt = toDate(normalized.pausedAt) ?? null;
  normalized.startedAt = toDate(normalized.startedAt) ?? null;
  normalized.status =
    typeof normalized.status === 'string' ? normalized.status : 'stopped';
  normalized.stoppedAt = toDate(normalized.stoppedAt) ?? null;

  // The row and nested JSON payload are runtime-normalized above before they
  // rejoin the Prisma-backed application document contract.
  return normalized as LivestreamBotSessionDocument;
}

export function serializeLivestreamSessionData(
  session: LivestreamBotSessionData,
): Prisma.InputJsonValue {
  const serialized = toJsonCompatible({
    context: session.context ?? { source: 'none' },
    deliveryHistory: session.deliveryHistory ?? [],
    lastTranscriptAt: session.lastTranscriptAt ?? null,
    pausedAt: session.pausedAt ?? null,
    platformStates: session.platformStates ?? [],
    startedAt: session.startedAt ?? null,
    status: session.status ?? 'stopped',
    stoppedAt: session.stoppedAt ?? null,
    transcriptChunks: session.transcriptChunks ?? [],
  });

  // Recursive conversion removes undefined object fields and converts Dates;
  // Prisma does not expose a matching recursive input type for this boundary.
  return serialized as Prisma.InputJsonValue;
}
