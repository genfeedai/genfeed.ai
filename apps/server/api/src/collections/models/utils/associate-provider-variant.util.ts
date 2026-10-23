import type { Model, Prisma } from '@genfeedai/prisma';

/** First association preserves the same model's existing organization access and default. */
export async function associateProviderVariant(
  tx: Prisma.TransactionClient,
  model: Pick<Model, 'id' | 'key' | 'isDefault'>,
  source: Pick<Model, 'id' | 'key' | 'isProviderVariant' | 'isDefault'>,
): Promise<void> {
  if (model.id === source.id || source.isProviderVariant) return;
  await tx.model.update({
    where: { id: source.id, organizationId: null, isDeleted: false },
    data: {
      isProviderVariant: true,
      ...(source.isDefault ? { isDefault: false } : {}),
    },
  });
  if (source.isDefault && !model.isDefault)
    await tx.model.update({
      where: { id: model.id, organizationId: null, isDeleted: false },
      data: { isDefault: true },
    });
  // tenant-scope-ignore: reference-data/admin association maps existing grants to the same logical model once; subsequent operator opt-outs are preserved.
  await tx.$executeRaw`
 UPDATE organization_settings AS s
 SET "enabledModelIds" = array_append(s."enabledModelIds", ${model.key}), "updatedAt" = CURRENT_TIMESTAMP
 WHERE (${source.id} = ANY(s."enabledModelIds") OR ${source.key} = ANY(s."enabledModelIds"))
 AND NOT (${model.id} = ANY(s."enabledModelIds") OR ${model.key} = ANY(s."enabledModelIds"))
 AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = s."organizationId" AND o."isDeleted" = false)`;
}
