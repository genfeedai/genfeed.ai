import type { TriggerEvent } from '@api/collections/workflows/services/workflow-executor.types';
import {
  RetiredWorkflowExecutionError,
  WorkflowExecutorDocumentService,
} from '@api/collections/workflows/services/workflow-executor-document.service';
import {
  buildHiddenSystemWorkflowMetadata,
  HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
  SYSTEM_WORKFLOW_METADATA_KEY,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import { WorkflowLifecycle, WorkflowStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowExecutorDocumentService', () => {
  const prisma = {
    workflow: {
      findMany: vi.fn(),
    },
    workflowVersion: {
      findFirst: vi.fn(),
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

  it('loads an ordinary pinned version only for its owning tenant', async () => {
    prisma.workflowVersion.findFirst.mockResolvedValue(
      pinnedVersionRow('org-1', 'user-1'),
    );

    const workflow = await service.findPinnedWorkflow(
      'workflow-1',
      'version-1',
      'org-1',
      'actor-1',
    );

    expect(workflow).toMatchObject({
      organizationId: 'org-1',
      userId: 'user-1',
      versionId: 'version-1',
    });
    expect(prisma.workflowVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          workflow: {
            select: expect.objectContaining({ isDeleted: true }),
          },
        }),
      }),
    );
  });

  it('rejects a pinned version owned by a retired workflow before dispatch', async () => {
    prisma.workflowVersion.findFirst.mockResolvedValue({
      ...pinnedVersionRow('org-1', 'user-1'),
      workflow: {
        ...pinnedVersionRow('org-1', 'user-1').workflow,
        isDeleted: true,
      },
    });

    await expect(
      service.findPinnedWorkflow('workflow-1', 'version-1', 'org-1', 'actor-1'),
    ).rejects.toBeInstanceOf(RetiredWorkflowExecutionError);
  });

  it('projects a proven global hidden mirror into the execution tenant and actor', async () => {
    prisma.workflowVersion.findFirst.mockResolvedValue(
      pinnedVersionRow(
        SYSTEM_WORKFLOW_PRINCIPAL_ID,
        SYSTEM_WORKFLOW_PRINCIPAL_ID,
        {
          sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
          [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata({
            canonicalId: 'youtube-to-long-form-text',
          }),
        },
      ),
    );

    const workflow = await service.findPinnedWorkflow(
      'workflow-1',
      'version-1',
      'tenant-org',
      'tenant-user',
    );

    expect(workflow).toMatchObject({
      organizationId: 'tenant-org',
      userId: 'tenant-user',
      versionId: 'version-1',
    });
  });

  it('rejects a retired global hidden mirror after proving its system identity', async () => {
    const version = pinnedVersionRow(
      SYSTEM_WORKFLOW_PRINCIPAL_ID,
      SYSTEM_WORKFLOW_PRINCIPAL_ID,
      {
        sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
        [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata({
          canonicalId: 'youtube-to-long-form-text',
        }),
      },
    );
    prisma.workflowVersion.findFirst.mockResolvedValue({
      ...version,
      workflow: { ...version.workflow, isDeleted: true },
    });

    await expect(
      service.findPinnedWorkflow(
        'workflow-1',
        'version-1',
        'tenant-org',
        'tenant-user',
      ),
    ).rejects.toBeInstanceOf(RetiredWorkflowExecutionError);
  });

  it('rejects a principal-owned version without the exact hidden metadata proof', async () => {
    prisma.workflowVersion.findFirst.mockResolvedValue(
      pinnedVersionRow(
        SYSTEM_WORKFLOW_PRINCIPAL_ID,
        SYSTEM_WORKFLOW_PRINCIPAL_ID,
        { sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE },
      ),
    );

    await expect(
      service.findPinnedWorkflow(
        'workflow-1',
        'version-1',
        'tenant-org',
        'tenant-user',
      ),
    ).resolves.toBeNull();
  });

  it('does not disclose retired state across the tenant boundary', async () => {
    prisma.workflowVersion.findFirst.mockResolvedValue({
      ...pinnedVersionRow('org-other', 'user-other'),
      workflow: {
        ...pinnedVersionRow('org-other', 'user-other').workflow,
        isDeleted: true,
      },
    });

    await expect(
      service.findPinnedWorkflow('workflow-1', 'version-1', 'org-1', 'actor-1'),
    ).resolves.toBeNull();
  });
});

function pinnedVersionRow(
  organizationId: string,
  userId: string,
  metadata: Record<string, unknown> = {},
) {
  return {
    graph: { edges: [], lockedNodeIds: [], nodes: [] },
    id: 'version-1',
    inputSchema: [],
    organizationId,
    userId,
    version: 1,
    workflow: {
      brandId: null,
      config: {},
      description: null,
      id: 'workflow-1',
      isDeleted: false,
      label: 'Workflow',
      metadata,
      organizationId,
      userId,
    },
  };
}

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
    currentVersion: {
      graph: {
        edges: [],
        lockedNodeIds: [],
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
      },
      id: `${id}-version`,
      inputSchema: [],
      version: 1,
    },
    id,
    label: id,
    metadata: {},
    organizationId: 'org-1',
    userId: 'user-1',
  };
}
