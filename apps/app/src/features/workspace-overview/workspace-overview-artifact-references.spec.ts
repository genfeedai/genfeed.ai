import { Task } from '@services/management/tasks.service';
import { describe, expect, it } from 'vitest';
import { getWorkspaceOverviewArtifactReferences } from './workspace-overview-artifact-references';

describe('getWorkspaceOverviewArtifactReferences', () => {
  it('maps supported linked content to scoped canonical references', () => {
    const task = new Task({
      id: 'task-1',
      linkedEntities: [
        { entityId: 'post-1', entityModel: 'Post' },
        { entityId: 'article-1', entityModel: 'Article' },
        { entityId: 'ingredient-1', entityModel: 'Ingredient' },
        { entityId: 'evaluation-1', entityModel: 'Evaluation' },
        { entityId: 'post-1', entityModel: 'Post' },
      ],
    });

    expect(
      getWorkspaceOverviewArtifactReferences(task, {
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    ).toEqual([
      {
        brandId: 'brand-1',
        kind: 'post',
        organizationId: 'org-1',
        recordId: 'post-1',
        serializer: 'post',
      },
      {
        brandId: 'brand-1',
        kind: 'article',
        organizationId: 'org-1',
        recordId: 'article-1',
        serializer: 'article',
      },
      {
        brandId: 'brand-1',
        kind: 'ingredient',
        organizationId: 'org-1',
        recordId: 'ingredient-1',
        serializer: 'ingredient',
      },
    ]);
  });

  it('returns no references without an authorized task and scope', () => {
    expect(
      getWorkspaceOverviewArtifactReferences(null, {
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    ).toEqual([]);
    expect(
      getWorkspaceOverviewArtifactReferences(
        new Task({
          id: 'task-1',
          linkedEntities: [{ entityId: 'post-1', entityModel: 'Post' }],
        }),
        { brandId: '', organizationId: 'org-1' },
      ),
    ).toEqual([]);
  });
});
