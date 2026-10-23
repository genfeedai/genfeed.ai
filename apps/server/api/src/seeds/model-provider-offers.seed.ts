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
  if (!(await prisma.model.findUnique({ where: { key: 'kie/kling-3.0' } }))) {
    await prisma.model.create({
      data: {
        key: 'kie/kling-3.0',
        endpoint: 'kling-3.0/video',
        label: 'Kling 3.0 · Kie.ai',
        category: 'video',
        provider: 'kie',
        isActive: true,
        isPublic: false,
        isProviderVariant: true,
        cost: 0,
        pricingType: 'conditional',
        providerSchemaFamily: 'kie-kling-3.0',
        providerInputSchema: toPrismaJson(KIE_KLING_INPUT_SCHEMA),
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
