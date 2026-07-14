import {
  AGENT_ARTIFACT_SERIALIZER_BY_KIND,
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

function createArtifactReference(
  entityModel: TaskLinkedEntityModel,
  recordId: string,
  scope: WorkspaceOverviewArtifactScope,
): AgentArtifactReference | null {
  const referenceScope = {
    brandId: scope.brandId,
    organizationId: scope.organizationId,
    recordId,
  };

  switch (entityModel) {
    case 'Article':
      return {
        ...referenceScope,
        kind: 'article',
        serializer: AGENT_ARTIFACT_SERIALIZER_BY_KIND.article,
      };
    case 'Ingredient':
      return {
        ...referenceScope,
        kind: 'ingredient',
        serializer: AGENT_ARTIFACT_SERIALIZER_BY_KIND.ingredient,
      };
    case 'Post':
      return {
        ...referenceScope,
        kind: 'post',
        serializer: AGENT_ARTIFACT_SERIALIZER_BY_KIND.post,
      };
    default:
      return null;
  }
}

export function getWorkspaceOverviewArtifactReferences(
  task: Task | null,
  scope: WorkspaceOverviewArtifactScope,
): readonly AgentArtifactReference[] {
  if (!task || !scope.brandId || !scope.organizationId) {
    return Object.freeze([]);
  }

  const references = new Map<string, AgentArtifactReference>();
  for (const entity of task.linkedEntities ?? []) {
    if (!entity.entityId) {
      continue;
    }

    const reference = createArtifactReference(
      entity.entityModel,
      entity.entityId,
      scope,
    );
    if (reference) {
      references.set(`${reference.kind}:${reference.recordId}`, reference);
    }
  }

  return Object.freeze([...references.values()]);
}
