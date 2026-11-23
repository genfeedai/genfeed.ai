import { associateProviderVariant } from '@api/collections/models/utils/associate-provider-variant.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MODEL_PROVIDER_ASSOCIATIONS } from '@genfeedai/contracts/constants';
import { toPrismaJson } from '@genfeedai/prisma';

export const KIE_KLING_INPUT_SCHEMA = {
  $id: 'kie-kling-3.0',
  type: 'object',
  additionalProperties: false,
  properties: {
    prompt: { type: 'string', minLength: 1, maxLength: 2500 },
    mode: { type: 'string', enum: ['std', 'pro'] },
    sound: { type: 'boolean' },
    duration: {
      type: 'string',
      enum: Array.from({ length: 13 }, (_, i) => String(i + 3)),
    },
    aspect_ratio: { type: 'string', enum: ['1:1', '16:9', '9:16'] },
    image_urls: {
      type: 'array',
      items: { type: 'string', format: 'uri' },
      maxItems: 2,
    },
    multi_shots: { type: 'boolean', const: false, default: false },
  },
  required: ['prompt', 'mode', 'sound', 'duration'],
};

const KIE_H3_DURATIONS = Array.from({ length: 12 }, (_, i) => i + 4);
const KIE_H3_FRAME_URL = {
  type: 'string',
  format: 'uri',
  pattern: '^(https?|oss)://',
};

/**
 * kie's MiniMax H3 text-to-video input (docs.kie.ai, read 2026-11-23). No
 * duration default: Replicate defaults to 5 and kie to 6, so a request that
 * names none is refused rather than quoted at the wrong length.
 */
export const KIE_MINIMAX_H3_TEXT_INPUT_SCHEMA = {
  $id: 'kie-minimax-h3-text',
  type: 'object',
  additionalProperties: false,
  properties: {
    prompt: { type: 'string', minLength: 1, maxLength: 7000 },
    aspect_ratio: {
      type: 'string',
      enum: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    },
    duration: { type: 'integer', enum: KIE_H3_DURATIONS },
    resolution: { type: 'string', enum: ['768P', '2K'], default: '2K' },
  },
  required: ['prompt', 'aspect_ratio', 'duration'],
};

/**
 * kie's MiniMax H3 image-to-video input. kie needs a first frame, a last
 * frame, or both; the offer adapter enforces that, as the JSON schema
 * conversion does not check `anyOf`.
 */
export const KIE_MINIMAX_H3_IMAGE_INPUT_SCHEMA = {
  $id: 'kie-minimax-h3-image',
  type: 'object',
  additionalProperties: false,
  properties: {
    prompt: { type: 'string', minLength: 1, maxLength: 7000 },
    first_frame_url: KIE_H3_FRAME_URL,
    last_frame_url: KIE_H3_FRAME_URL,
    duration: { type: 'integer', enum: KIE_H3_DURATIONS },
    resolution: { type: 'string', enum: ['768P', '2K'], default: '2K' },
  },
  required: ['prompt', 'duration'],
};

/**
 * kie's Wan 3.0 video input (docs.kie.ai, read 2026-11-23), without the
 * reference media fields: kie bills reference video seconds, which the reviewed
 * rates do not model, so the offer never sends them.
 */
export const KIE_WAN_3_INPUT_SCHEMA = {
  $id: 'kie-wan-3',
  type: 'object',
  additionalProperties: false,
  properties: {
    prompt: { type: 'string', minLength: 1, maxLength: 20000 },
    first_frame_url: { type: 'string', format: 'uri' },
    resolution: {
      type: 'string',
      enum: ['480P', '720P', '1080P'],
      default: '1080P',
    },
    aspect_ratio: {
      type: 'string',
      enum: ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16'],
      default: 'adaptive',
    },
    duration: { type: 'integer', minimum: 2, maximum: 30, default: 5 },
    seed: { type: 'integer', minimum: 0, maximum: 2147483647 },
  },
  required: ['prompt'],
};

/**
 * kie's Seedance 2.0 Fast input (docs.kie.ai, read 2026-11-23), without the
 * reference media, web search and seed fields the offer never sends. Duration
 * is 4 to 15 s (kie also takes -1, which Replicate's builder never sends).
 */
export const KIE_SEEDANCE_FAST_INPUT_SCHEMA = {
  $id: 'kie-seedance-2-fast',
  type: 'object',
  additionalProperties: false,
  properties: {
    prompt: { type: 'string', minLength: 3, maxLength: 20000 },
    first_frame_url: { type: 'string', minLength: 1 },
    last_frame_url: { type: 'string', minLength: 1 },
    generate_audio: { type: 'boolean', default: true },
    resolution: { type: 'string', enum: ['480p', '720p'], default: '720p' },
    aspect_ratio: {
      type: 'string',
      enum: ['1:1', '4:3', '3:4', '16:9', '9:16'],
      default: '16:9',
    },
    duration: { type: 'integer', minimum: 4, maximum: 15, default: 5 },
  },
  required: ['prompt'],
};

const KIE_VIDEO_REGISTRATIONS = [
  {
    key: 'kie/kling-3.0',
    endpoint: 'kling-3.0/video',
    label: 'Kling 3.0 · Kie.ai',
    schemaFamily: 'kie-kling-3.0',
    schema: KIE_KLING_INPUT_SCHEMA,
  },
  {
    key: 'kie/minimax-h3-text-to-video',
    endpoint: 'minimax-h3/text-to-video',
    label: 'MiniMax H3 text to video · Kie.ai',
    schemaFamily: 'kie-minimax-h3-text',
    schema: KIE_MINIMAX_H3_TEXT_INPUT_SCHEMA,
  },
  {
    key: 'kie/minimax-h3-image-to-video',
    endpoint: 'minimax-h3/image-to-video',
    label: 'MiniMax H3 image to video · Kie.ai',
    schemaFamily: 'kie-minimax-h3-image',
    schema: KIE_MINIMAX_H3_IMAGE_INPUT_SCHEMA,
  },
  {
    key: 'kie/wan-3-0-video',
    endpoint: 'wan/3-0-video',
    label: 'Wan 3.0 · Kie.ai',
    schemaFamily: 'kie-wan-3',
    schema: KIE_WAN_3_INPUT_SCHEMA,
  },
  {
    key: 'kie/seedance-2-fast',
    endpoint: 'bytedance/seedance-2-fast',
    label: 'Seedance 2.0 Fast · Kie.ai',
    schemaFamily: 'kie-seedance-2-fast',
    schema: KIE_SEEDANCE_FAST_INPUT_SCHEMA,
  },
] as const;

export async function seedProviderOfferRegistrations(
  prisma: PrismaService,
): Promise<number> {
  let written = 0;
  // Provider connections are platform settings; existing operator switches survive every sync.
  if (
    !(await prisma.providerRoutingSetting.findUnique({
      where: { provider: 'kie' },
    }))
  ) {
    await prisma.providerRoutingSetting.create({
      data: { provider: 'kie', isActive: false },
    });
    written++;
  }
  for (const registration of KIE_VIDEO_REGISTRATIONS) {
    // tenant-scope-ignore: `key` is globally unique; the presence check must also see soft-deleted rows or the create below would violate it.
    if (await prisma.model.findUnique({ where: { key: registration.key } }))
      continue;
    await prisma.model.create({
      data: {
        key: registration.key,
        endpoint: registration.endpoint,
        label: registration.label,
        category: 'video',
        provider: 'kie',
        isActive: true,
        isPublic: false,
        isProviderVariant: true,
        cost: 0,
        pricingType: 'conditional',
        providerSchemaFamily: registration.schemaFamily,
        providerInputSchema: toPrismaJson(registration.schema),
      },
    });
    written++;
  }
  return written;
}

export async function seedProviderOfferAssociations(
  prisma: PrismaService,
): Promise<number> {
  let written = 0;
  for (const association of MODEL_PROVIDER_ASSOCIATIONS) {
    written += await prisma.$transaction(async (tx) => {
      const model = await tx.model.findFirst({
        where: {
          key: association.modelKey,
          organizationId: null,
          isDeleted: false,
        },
      });
      const source = await tx.model.findFirst({
        where: {
          key: association.executionModelKey,
          organizationId: null,
          isDeleted: false,
          provider: association.provider,
          endpoint: association.endpoint,
        },
      });
      if (!model || !source) return 0;
      let changed = 0;
      for (const executionModelId of [model.id, source.id]) {
        if (
          !(await tx.modelProviderOffer.findUnique({
            where: {
              modelId_executionModelId: { modelId: model.id, executionModelId },
            },
          }))
        ) {
          await tx.modelProviderOffer.create({
            data: { modelId: model.id, executionModelId },
          });
          changed++;
        }
      }
      if (!source.isProviderVariant) {
        await associateProviderVariant(tx, model, source);
        changed++;
      }
      return changed;
    });
  }
  return written;
}
