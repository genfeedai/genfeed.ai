import { renderTransferResultForHistory } from '@api/services/agent-orchestrator/utils/agent-transfer-result-history.util';
import { UNTRUSTED_USER_DATA_FRAMING } from '@api/services/agent-orchestrator/utils/agent-untrusted-content.util';
import { AgentMessageRole } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('renderTransferResultForHistory', () => {
  it('tells the master what a finished thread produced, with its report fenced', () => {
    expect(
      renderTransferResultForHistory({
        content: 'Hero image finished.\n\nMade a 9:16 beach image.',
        metadata: {
          agentTransferResult: {
            destinationThreadId: 'thread-image',
            outputArtifactReferences: [
              {
                kind: 'ingredient',
                organizationId: 'org-1',
                recordId: 'image-1',
                serializer: 'ingredient',
              },
            ],
            status: 'COMPLETED',
            transferId: 'transfer-1',
          },
        },
        role: AgentMessageRole.SYSTEM,
      }),
    ).toBe(
      [
        'A thread you handed work to reported back. Thread thread-image, status COMPLETED.',
        'It produced these records. To hand any of them to another thread, pass them unchanged in artifactReferences on transfer_agent_conversation: [{"kind":"ingredient","organizationId":"org-1","recordId":"image-1","serializer":"ingredient"}]',
        UNTRUSTED_USER_DATA_FRAMING,
        'Hero image finished.',
        '',
        'Made a 9:16 beach image.',
      ].join('\n'),
    );
  });

  it('leaves out an output that is not a complete reference', () => {
    expect(
      renderTransferResultForHistory({
        content: '',
        metadata: {
          agentTransferResult: {
            destinationThreadId: 'thread-image',
            outputArtifactReferences: [
              { kind: 'ingredient', recordId: 'image-1' },
            ],
            status: 'COMPLETED',
          },
        },
        role: AgentMessageRole.SYSTEM,
      }),
    ).toBe(
      'A thread you handed work to reported back. Thread thread-image, status COMPLETED.\nIt recorded no output records.',
    );
  });

  it('says so when a thread recorded no outputs', () => {
    expect(
      renderTransferResultForHistory({
        content: '',
        metadata: {
          agentTransferResult: {
            destinationThreadId: 'thread-video',
            status: 'FAILED',
          },
        },
        role: AgentMessageRole.SYSTEM,
      }),
    ).toBe(
      'A thread you handed work to reported back. Thread thread-video, status FAILED.\nIt recorded no output records.',
    );
  });

  it.each([
    [
      'a user message',
      {
        content: 'hi',
        metadata: {
          agentTransferResult: {
            destinationThreadId: 't',
            status: 'COMPLETED',
          },
        },
        role: AgentMessageRole.USER,
      },
    ],
    [
      'a system message with no transfer result',
      { content: 'note', metadata: {}, role: AgentMessageRole.SYSTEM },
    ],
    [
      'a result missing its thread',
      {
        content: 'note',
        metadata: { agentTransferResult: { status: 'COMPLETED' } },
        role: AgentMessageRole.SYSTEM,
      },
    ],
  ])('leaves %s alone', (_label, message) => {
    expect(renderTransferResultForHistory(message)).toBeNull();
  });
});
