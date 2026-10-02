import { brandIdentitySnapshotV1Schema } from '@genfeedai/contracts/api-types/contracts';
import { learningContractHashSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import { buildSerializer } from '@serializers/builders';
import { brandIdentityPreviewSerializerConfig } from '@serializers/configs/content/brand-identity-preview.config';
import { z } from 'zod';

const preview = z
  .strictObject({
    id: learningContractHashSchema,
    snapshot: brandIdentitySnapshotV1Schema,
    source: z.enum(['current_approved_revision', 'receipt_snapshot']),
  })
  .refine(
    (value) => value.id === value.snapshot.contentHash,
    'Identity hash mismatch',
  );
export const { BrandIdentityPreviewSerializer } = buildSerializer(
  'server',
  brandIdentityPreviewSerializerConfig,
);
const serialize = BrandIdentityPreviewSerializer.serialize.bind(
  BrandIdentityPreviewSerializer,
);
BrandIdentityPreviewSerializer.serialize = (payload: unknown) =>
  serialize(
    payload === null
      ? null
      : Array.isArray(payload)
        ? payload.map((value) => preview.parse(value))
        : preview.parse(payload),
  );
