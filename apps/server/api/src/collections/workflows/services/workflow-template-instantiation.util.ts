import { isPrismaUniqueConstraintError } from '@api/collections/shared/slug-allocation.util';
import type { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { hashTemplateInstantiationRequest } from '@api/collections/workflows/services/workflow-create-payload.util';
import { WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/workflow-templates';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BadRequestException, ConflictException } from '@nestjs/common';

type TemplateInstantiationScope = {
  key: string;
  normalize: (document: unknown) => WorkflowDocument;
  organizationId: string;
  prisma: Pick<PrismaService, 'workflow'>;
  requestHash: string;
  userId: string;
};

type TemplateInstantiationCreateInput = Omit<
  TemplateInstantiationScope,
  'key' | 'requestHash'
> & {
  brandId?: string;
  create: (data: CreateWorkflowDto) => Promise<WorkflowDocument>;
  key?: string;
  payload: Record<string, unknown>;
  templateId?: string;
};

export function validateTemplateInstantiationKey(
  workflowData: CreateWorkflowDto,
): string | undefined {
  const key = workflowData.idempotencyKey;
  if (
    key !== undefined &&
    (typeof key !== 'string' ||
      key.trim().length === 0 ||
      key.length > 256 ||
      !workflowData.templateId ||
      !Object.hasOwn(WORKFLOW_TEMPLATES, workflowData.templateId) ||
      workflowData.sourceWorkflowId ||
      (workflowData.sourceType !== undefined &&
        workflowData.sourceType !== 'seeded-template') ||
      (workflowData.metadata?.sourceType !== undefined &&
        workflowData.metadata.sourceType !== 'seeded-template'))
  ) {
    throw new BadRequestException(
      'idempotencyKey requires a seeded template creation',
    );
  }

  return key;
}

async function findTemplateInstantiation(
  input: TemplateInstantiationScope,
): Promise<WorkflowDocument | null> {
  const { organizationId, userId, key, requestHash, prisma, normalize } = input;
  const where = { organizationId, userId, templateInstantiationKey: key };
  const existing = await prisma.workflow.findFirst({
    include: { currentVersion: true },
    where: { ...where, isDeleted: false },
  });
  if (existing) {
    if (existing.templateInstantiationRequestHash !== requestHash) {
      throw new ConflictException(
        'Template attempt belongs to another template or brand',
      );
    }
    return normalize(existing);
  }
  const deleted = await prisma.workflow.findFirst({
    select: { id: true },
    where: { ...where, isDeleted: true },
  });
  if (deleted)
    throw new ConflictException(
      'Template attempt was deleted; start a new attempt',
    );
  return null;
}

/** Only the transaction winner may proceed to scheduling or execution. */
export async function createWorkflowWithTemplateInstantiation(
  input: TemplateInstantiationCreateInput,
): Promise<{ workflow: WorkflowDocument; isCreated: boolean }> {
  const { key, templateId, brandId, payload, create } = input;
  const requestHash =
    key && templateId
      ? hashTemplateInstantiationRequest(templateId, brandId)
      : undefined;
  const scope = key && requestHash ? { ...input, key, requestHash } : undefined;
  if (scope) {
    const existing = await findTemplateInstantiation(scope);
    if (existing) return { workflow: existing, isCreated: false };
  }
  try {
    const workflow = await create({
      ...payload,
      ...(key
        ? {
            templateInstantiationKey: key,
            templateInstantiationRequestHash: requestHash,
          }
        : {}),
    } as unknown as CreateWorkflowDto);
    return { workflow, isCreated: true };
  } catch (error: unknown) {
    if (!scope || !isPrismaUniqueConstraintError(error)) throw error;
    const winner = await findTemplateInstantiation(scope);
    if (!winner) throw error;
    return { workflow: winner, isCreated: false };
  }
}
