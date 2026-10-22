import { z } from 'zod';
import { ContentCampaignStatus } from '../../enums/content-campaign.enum';

const identity = {
  brandId: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
};
const context = {
  audience: z.string().max(2000).nullable().optional(),
  tone: z.string().max(1000).nullable().optional(),
  creativeDirection: z.string().max(4000).nullable().optional(),
  assetIds: z
    .array(z.string().min(1))
    .max(50)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      'Campaign asset IDs must be unique',
    )
    .optional(),
  brief: z.string().max(8000).nullable().optional(),
  objective: z.string().max(1000).nullable().optional(),
  startDate: z.iso.datetime({ offset: true }).nullable().optional(),
  endDate: z.iso.datetime({ offset: true }).nullable().optional(),
};

export const contentCampaignMcpSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('list'),
      input: z
        .object({
          brandId: identity.brandId,
          page: z.number().int().min(1).optional(),
          limit: z.number().int().min(1).max(50).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('get'),
      input: z.object(identity).strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('create'),
      input: z
        .object({
          ...context,
          brandId: identity.brandId,
          name: z.string().trim().min(1).max(200),
          idempotencyKey: z.string().trim().min(1).max(255),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('update'),
      input: z
        .object({
          ...context,
          ...identity,
          name: z.string().trim().min(1).max(200).optional(),
        })
        .strict(),
    })
    .strict(),
]);

export type ContentCampaignMcpInput = z.infer<typeof contentCampaignMcpSchema>;

export const contentCampaignResourceSchema = z
  .object({
    id: z.string().min(1),
    attributes: z.object({
      ...context,
      brandId: identity.brandId,
      name: z.string(),
      organizationId: z.string().min(1),
      userId: z.string().min(1),
      status: z.enum(ContentCampaignStatus),
      isDeleted: z.boolean(),
      createdAt: z.string().min(1),
      updatedAt: z.string().min(1),
      assetIds: z.array(z.string()).default([]),
    }),
  })
  .transform(({ id, attributes }) => ({ ...attributes, id }));
