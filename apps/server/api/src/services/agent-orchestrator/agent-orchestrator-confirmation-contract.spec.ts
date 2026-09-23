import { AgentOrchestratorUiActionConfirmedToolService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-confirmed-tool.service';
import { getActionDefinition } from '@genfeedai/actions';
import {
  type ActionContractJsonSchema,
  compileActionContract,
} from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

type ConfirmationCase = {
  action: Parameters<
    AgentOrchestratorUiActionConfirmedToolService['execute']
  >[0];
  tool: string;
  payload: Record<string, unknown>;
};
const cases: ConfirmationCase[] = [
  {
    action: 'confirm_save_brand_voice_profile',
    tool: 'save_brand_voice_profile',
    payload: {
      brandId: 'brand',
      voiceProfile: { tone: 'Warm', audience: ['Founders'] },
    },
  },
  {
    action: 'confirm_agent_transfer',
    tool: 'transfer_agent_conversation',
    payload: {
      content: 'Continue this draft',
      deliveryMode: 'SEND_AND_RUN',
      idempotencyKey: 'handoff',
      destinationThreadId: 'destination',
      sourceThreadId: 'thread',
      artifactVersionPinIds: ['pin'],
      parentCorrelationId: 'parent',
      selectedContext: { topic: 'AI' },
      artifactReferences: [
        {
          kind: 'post',
          serializer: 'post',
          organizationId: 'org',
          recordId: 'post',
        },
      ],
    },
  },
  {
    action: 'confirm_install_official_workflow',
    tool: 'install_official_workflow',
    payload: {
      prompt: 'Generate weekly posts',
      sourceId: 'template',
      sourceType: 'seeded-template',
      brandId: 'brand',
    },
  },
  {
    action: 'confirm_publish_post',
    tool: 'create_post',
    payload: {
      contentId: 'post',
      platforms: ['twitter'],
      caption: 'Launch',
      visibility: 'public',
    },
  },
  {
    action: 'confirm_publish_post',
    tool: 'create_post',
    payload: {
      caption: 'Launch',
      contentId: 'post',
      platforms: ['threads'],
      scheduledAt: '2026-09-24T12:00:00.000Z',
      postingSetId: 'posting-set',
      visibility: 'public',
      targets: [
        {
          attachments: [
            {
              body: 'Follow for more',
              kind: 'signature',
              order: 0,
              platform: 'threads',
            },
          ],
          caption: 'A launch for X',
          credentialId: 'credential',
          platform: 'threads',
          settings: { reply_settings: 'everyone', options: { enabled: true } },
          signatureIds: ['signature'],
          visibility: 'public',
        },
      ],
    },
  },
  {
    action: 'confirm_publish_post',
    tool: 'create_post',
    payload: {
      contentId: 'post',
      platforms: ['twitter'],
      postingSetId: 'posting-set',
      scheduledAt: '2026-09-24T12:00:00.000Z',
      timezone: 'Europe/Malta',
      targets: [
        {
          attachments: [
            {
              body: 'Follow for more',
              kind: 'signature',
              order: 0,
              platform: 'twitter',
            },
          ],
          credentialId: 'credential',
          platform: 'twitter',
          scheduledAt: '2026-09-24T13:00:00.000Z',
          signatureIds: ['signature'],
          timezone: 'Europe/Malta',
        },
      ],
    },
  },
  {
    action: 'confirm_outreach_sequence',
    tool: 'start_outreach_sequence',
    payload: { campaignId: 'campaign', transition: 'start' },
  },
  {
    action: 'confirm_outreach_sequence',
    tool: 'pause_outreach_sequence',
    payload: { campaignId: 'campaign', transition: 'pause' },
  },
];

describe('approval payload action contracts', () => {
  it.each(cases)(
    'passes $tool approval arguments through its real input schema',
    async ({ action, tool, payload }) => {
      const executeTool = vi.fn(
        async (name: string, input: Record<string, unknown>) => {
          const definition = getActionDefinition(name);
          if (!definition) throw new Error(`Missing action ${name}`);
          compileActionContract(name, {
            inputSchema: definition.inputSchema as ActionContractJsonSchema,
            outputSchema: definition.outputSchema as ActionContractJsonSchema,
          }).validateInput(input, {
            nodeId: 'execute-tool',
            runId: 'run',
            workflowId: 'workflow',
            workflowVersionId: 'v1',
          });
          return { success: true, creditsUsed: 0 };
        },
      );
      const service = new AgentOrchestratorUiActionConfirmedToolService(
        { executeTool } as never,
        { recordToolStarted: vi.fn(), recordToolCompleted: vi.fn() } as never,
        {
          finalizeStructuredAssistantTurn: vi.fn().mockResolvedValue({}),
        } as never,
        {
          acquireLock: vi.fn().mockResolvedValue(true),
          get: vi.fn().mockResolvedValue(null),
          set: vi.fn(),
          releaseLock: vi.fn(),
        } as never,
        {} as never,
        {} as never,
      );
      await service.execute(action, {
        context: { organizationId: 'org', userId: 'user' },
        threadId: 'thread',
        model: 'chat',
        payload: { ...payload, sourceActionId: 'approval-token' },
      });
      expect(executeTool).toHaveBeenCalledWith(
        tool,
        expect.any(Object),
        expect.objectContaining({
          confirmationOrigin: 'thread-ui-action',
          sourceActionId: 'approval-token',
          threadId: 'thread',
        }),
      );
      const input = executeTool.mock.calls[0][1];
      if (
        tool === 'transfer_agent_conversation' ||
        tool === 'save_brand_voice_profile'
      ) {
        expect(input).not.toHaveProperty('sourceActionId');
        expect(input).not.toHaveProperty('sourceThreadId');
      } else {
        expect(input).toMatchObject({
          confirmed: true,
          sourceActionId: 'approval-token',
        });
      }
    },
  );
});
