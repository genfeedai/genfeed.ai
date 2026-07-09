import type { TriggerEvent } from '@api/collections/workflows/services/workflow-executor.types';
import { WorkflowExecutorDocumentService } from '@api/collections/workflows/services/workflow-executor-document.service';
import { WorkflowLifecycle, WorkflowStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowExecutorDocumentService', () => {
  const prisma = {
    workflow: {
      findMany: vi.fn(),
    },
  };

  let service: WorkflowExecutorDocumentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WorkflowExecutorDocumentService(prisma as never);
  });

  it('matches inbound comments to active workflow rules for the same platform and filters', async () => {
    prisma.workflow.findMany.mockResolvedValue([
      workflowRow('wf-match', {
        brandId: 'brand-1',
        conversationId: 'conversation-1',
        contentIds: ['video-1'],
        credentialId: 'credential-1',
        excludeKeywords: ['spam'],
        keywords: ['pricing'],
        platform: 'youtube',
      }),
      workflowRow('wf-other-platform', {
        keywords: ['pricing'],
        platform: 'instagram',
      }),
    ]);

    const matches = await service.findMatchingWorkflows(commentEvent());

    expect(prisma.workflow.findMany).toHaveBeenCalledWith({
      select: expect.any(Object),
      where: {
        isDeleted: false,
        lifecycle: WorkflowLifecycle.PUBLISHED,
        organizationId: 'org-1',
        status: WorkflowStatus.ACTIVE,
      },
    });
    expect(matches.map((workflow) => workflow.id)).toEqual(['wf-match']);
  });

  it('skips comment workflows when configured rule fields do not match the inbound message', async () => {
    prisma.workflow.findMany.mockResolvedValue([
      workflowRow('wf-wrong-brand', {
        brandId: 'brand-2',
        platform: 'youtube',
      }),
      workflowRow('wf-wrong-credential', {
        credentialId: 'credential-2',
        platform: 'youtube',
      }),
      workflowRow('wf-wrong-conversation', {
        conversationId: 'conversation-2',
        platform: 'youtube',
      }),
      workflowRow('wf-wrong-content', {
        contentIds: ['video-2'],
        platform: 'youtube',
      }),
      workflowRow('wf-keyword-miss', {
        keywords: ['billing'],
        platform: 'youtube',
      }),
      workflowRow('wf-excluded', {
        excludeKeywords: ['pricing'],
        platform: 'youtube',
      }),
      workflowRow('wf-disabled-node', {
        enabled: false,
        platform: 'youtube',
      }),
    ]);

    const matches = await service.findMatchingWorkflows(commentEvent());

    expect(matches).toEqual([]);
  });

  it('supports visual trigger aliases and comma-separated keyword rules', async () => {
    prisma.workflow.findMany.mockResolvedValue([
      workflowRow(
        'wf-visual-alias',
        {
          excludeKeywords: 'spam, abuse',
          keywords: 'pricing, upgrade',
          platform: 'youtube',
        },
        'trigger-comment',
      ),
    ]);

    const matches = await service.findMatchingWorkflows(commentEvent());

    expect(matches.map((workflow) => workflow.id)).toEqual(['wf-visual-alias']);
  });
});

function commentEvent(): TriggerEvent {
  return {
    data: {
      brandId: 'brand-1',
      conversationId: 'conversation-1',
      credentialId: 'credential-1',
      messageId: 'message-1',
      platform: 'youtube',
      sourceContentId: 'video-1',
      text: 'Can you explain pricing for this launch?',
    },
    organizationId: 'org-1',
    platform: 'youtube',
    type: 'commentTrigger',
    userId: 'user-1',
  };
}

function workflowRow(
  id: string,
  config: Record<string, unknown>,
  nodeType = 'commentTrigger',
) {
  return {
    config: {},
    edges: [],
    id,
    inputVariables: [],
    label: id,
    metadata: {},
    mongoId: id,
    nodes: [
      {
        data: {
          config,
          label: 'Comment trigger',
        },
        id: `${id}-trigger`,
        position: { x: 0, y: 0 },
        type: nodeType,
      },
    ],
    organizationId: 'org-1',
    steps: [],
    userId: 'user-1',
  };
}
