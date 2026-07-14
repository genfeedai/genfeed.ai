import {
  AGENT_ARTIFACT_SERIALIZER_BY_KIND,
  type AgentArtifactRecordKind,
  type AgentArtifactReference,
} from '@genfeedai/interfaces';
import type {
  Task,
  TaskLinkedEntityModel,
} from '@services/management/tasks.service';

interface WorkspaceOverviewArtifactScope {
  readonly brandId: string;
  readonly organizationId: string;
}

const ARTIFACT_KIND_BY_TASK_ENTITY: Readonly<
  Partial<Record<TaskLinkedEntityModel, AgentArtifactRecordKind>>
> = Object.freeze({
  Article: 'article',
  Ingredient: 'ingredient',
  Post: 'post',
});

export function getWorkspaceOverviewArtifactReferences(
  task: Task | null,
  scope: WorkspaceOverviewArtifactScope,
): readonly AgentArtifactReference[] {
  if (!task || !scope.brandId || !scope.organizationId) {
    return Object.freeze([]);
  }

  const references = new Map<string, AgentArtifactReference>();
  for (const entity of task.linkedEntities ?? []) {
    const kind = ARTIFACT_KIND_BY_TASK_ENTITY[entity.entityModel];
    if (!kind || !entity.entityId) {
      continue;
    }

    references.set(`${kind}:${entity.entityId}`, {
      brandId: scope.brandId,
      kind,
      organizationId: scope.organizationId,
      recordId: entity.entityId,
      serializer: AGENT_ARTIFACT_SERIALIZER_BY_KIND[kind],
    });
  }

  return Object.freeze([...references.values()]);
}
