import { normalizePostDocument } from '@api/collections/posts/services/post-document-projection.util';
import {
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';

const capturedPost = {
  id: 'captured-post',
  source: 'extension',
  targetSettings: { extensionCapture: { version: 1 } },
  targetExecutionState: TargetExecutionState.PUBLISHED,
  status: PostStatus.DRAFT,
};

describe('normalizePostDocument', () => {
  it.each([
    {
      visibility: 'public',
      expected: PostVisibility.PUBLIC,
      status: PostStatus.PUBLIC,
    },
    {
      visibility: 'private',
      expected: PostVisibility.PRIVATE,
      status: PostStatus.PRIVATE,
    },
    {
      visibility: 'unlisted',
      expected: PostVisibility.UNLISTED,
      status: PostStatus.UNLISTED,
    },
    { visibility: 'unknown', expected: null, status: PostStatus.PUBLIC },
    { visibility: null, expected: null, status: PostStatus.PUBLIC },
  ])(
    'projects captured audience $visibility',
    ({ visibility, expected, status }) => {
      const post = { ...capturedPost, visibility };
      expect(normalizePostDocument(post)).toEqual({
        ...post,
        visibility: expected,
        status,
      });
      expect(post.status).toBe(PostStatus.DRAFT);
    },
  );

  it('defaults ordinary missing visibility to public', () => {
    const post = { ...capturedPost, source: 'api', targetSettings: {} };
    expect(normalizePostDocument(post)).toEqual({
      ...post,
      visibility: PostVisibility.PUBLIC,
      status: PostStatus.PUBLIC,
    });
  });

  it('projects an invalid execution state to draft and retains the audience', () => {
    const post = {
      ...capturedPost,
      targetExecutionState: 'invalid',
      visibility: PostVisibility.PRIVATE,
    };
    expect(normalizePostDocument(post)).toEqual({
      ...post,
      targetExecutionState: TargetExecutionState.DRAFT,
      status: PostStatus.DRAFT,
    });
  });
});
