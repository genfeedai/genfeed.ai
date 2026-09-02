import {
  buildAgentArtifactCompletionMetadata,
  mergeAgentArtifactCompletionMetadata,
} from '@api/services/agent-orchestrator/utils/agent-artifact-reference-metadata.util';
import { describe, expect, it } from 'vitest';

describe('agent artifact reference completion metadata', () => {
  it('maps only finite explicit canonical record-id fields', () => {
    expect(
      buildAgentArtifactCompletionMetadata(
        {
          articleId: 'article-1',
          artifactVersionPinId: 'pin-1',
          postIds: ['post-1', 'post-2'],
        },
        { brandId: 'brand-1', organizationId: 'org-1' },
      ),
    ).toEqual({
      artifactReferences: [
        {
          brandId: 'brand-1',
          kind: 'article',
          organizationId: 'org-1',
          recordId: 'article-1',
          serializer: 'article',
        },
        {
          brandId: 'brand-1',
          kind: 'post',
          organizationId: 'org-1',
          recordId: 'post-1',
          serializer: 'post',
        },
        {
          brandId: 'brand-1',
          kind: 'post',
          organizationId: 'org-1',
          recordId: 'post-2',
          serializer: 'post',
        },
      ],
      artifactVersionPinIds: ['pin-1'],
    });
  });

  it('does not infer authority from URLs, text, action ids, or UI actions', () => {
    expect(
      buildAgentArtifactCompletionMetadata(
        {
          actionId: 'post-post-1',
          href: '/content/posts/post-1',
          message: 'Created post post-1',
          uiActions: [{ contentId: 'ingredient-1' }],
        },
        { organizationId: 'org-1' },
      ),
    ).toEqual({});
  });

  it('deduplicates completion metadata shared by a message and run', () => {
    const reference = {
      kind: 'post' as const,
      organizationId: 'org-1',
      recordId: 'post-1',
      serializer: 'post' as const,
    };

    expect(
      mergeAgentArtifactCompletionMetadata([
        {
          artifactReferences: [reference],
          artifactVersionPinIds: ['pin-1'],
        },
        {
          artifactReferences: [reference],
          artifactVersionPinIds: ['pin-1'],
        },
      ]),
    ).toEqual({
      artifactReferences: [reference],
      artifactVersionPinIds: ['pin-1'],
    });
  });
});
