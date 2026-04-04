import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createSocialPublishExecutor,
  type SocialPublisher,
} from '@workflow-engine/executors/saas/social-publish-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctx: ExecutionContext = {
  organizationId: 'org-1',
  runId: 'run-1',
  userId: 'user-1',
  workflowId: 'wf-1',
};

function makeInput(
  config: Record<string, unknown>,
  inputMap?: Record<string, unknown>,
): ExecutorInput {
  return {
    context: ctx,
    inputs: new Map<string, unknown>(Object.entries(inputMap ?? {})),
    node: {
      config,
      id: 'sp-1',
      inputs: [],
      label: 'SP',
      type: 'socialPublish',
    } as ExecutableNode,
  };
}

describe('SocialPublishExecutor', () => {
  let publisher: SocialPublisher;

  beforeEach(() => {
    publisher = vi
      .fn()
      .mockResolvedValue({ postId: 'p-1', publishedUrl: 'https://x.com/p/1' });
  });

  describe('validate', () => {
    it('valid with correct platform', () => {
      const exec = createSocialPublishExecutor();
      expect(
        exec.validate({
          config: { platform: 'youtube' },
          id: '1',
          inputs: [],
          label: 'SP',
          type: 'socialPublish',
        }).valid,
      ).toBe(true);
    });
    it('invalid without platform', () => {
      const exec = createSocialPublishExecutor();
      expect(
        exec.validate({
          config: {},
          id: '1',
          inputs: [],
          label: 'SP',
          type: 'socialPublish',
        }).valid,
      ).toBe(false);
    });
    it('invalid with bad visibility', () => {
      const exec = createSocialPublishExecutor();
      expect(
        exec.validate({
          config: { platform: 'youtube', visibility: 'secret' },
          id: '1',
          inputs: [],
          label: 'SP',
          type: 'socialPublish',
        }).valid,
      ).toBe(false);
    });
  });

  describe('execute', () => {
    it('throws without publisher', async () => {
      await expect(
        createSocialPublishExecutor().execute(
          makeInput({ platform: 'youtube' }, { video: 'v.mp4' }),
        ),
      ).rejects.toThrow('publisher');
    });
    it('publishes video', async () => {
      const exec = createSocialPublishExecutor(publisher);
      const result = await exec.execute(
        makeInput({ platform: 'youtube', title: 'Test' }, { video: 'v.mp4' }),
      );
      expect(result.data).toBe('https://x.com/p/1');
      expect(result.metadata?.platform).toBe('youtube');
    });
    it('handles scheduled time', async () => {
      const exec = createSocialPublishExecutor(publisher);
      await exec.execute(
        makeInput(
          { platform: 'twitter', scheduledTime: '2025-06-01T12:00:00Z' },
          { video: 'v.mp4' },
        ),
      );
      expect(publisher).toHaveBeenCalledWith(
        expect.objectContaining({ scheduledTime: expect.any(Date) }),
      );
    });
  });
});
