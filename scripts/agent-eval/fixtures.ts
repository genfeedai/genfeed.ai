import type { FixtureMetadata, LogicalIntent, TaskFixture } from './contracts';

export const FIXTURE_METADATA: FixtureMetadata = {
  fixtureVersion: 1,
  provider: 'none',
  model: 'none',
  providerVersion: 'not-applicable',
  modelVersion: 'not-applicable',
  rubricVersion: 'contract-exact-v1',
};

const intent: LogicalIntent = {
  arguments: {
    campaignId: 'fixture-campaign',
    options: { limit: 2, platform: 'x' },
  },
  organizationId: 'fixture-org',
  threadId: 'fixture-thread',
  scope: { brandId: 'fixture-brand', contextVersion: 3 },
  toolName: 'start_outreach_sequence',
  userId: 'fixture-user',
};
const emptyView = {
  hasLatestProposedPlan: false,
  hasPendingInputRequest: false,
  isStreaming: false,
  messageCount: 0,
  pendingUiActionCount: 0,
  streamingContentLength: 0,
  streamingReasoningLength: 0,
  workEventCount: 0,
};

export const TASK_FIXTURES: readonly TaskFixture[] = [
  {
    id: 'structured-prepared-result',
    kind: 'structured-output',
    task: 'Accept a typed pending result with confirmation and JSON action metadata.',
    input: {
      creditsUsed: 0,
      success: true,
      requiresConfirmation: true,
      riskLevel: 'high',
      data: { approvalId: 'fixture-approval' },
      nextActions: [{ type: 'mutation_approval_card', id: 'fixture-card' }],
    },
    expected: { valid: true, correlatedError: false },
  },
  {
    id: 'structured-error-result',
    kind: 'structured-output',
    task: 'Accept an explicit failed tool result without treating it as success.',
    input: { creditsUsed: 0, success: false, error: 'Provider unavailable' },
    expected: { valid: true, correlatedError: false },
  },
  {
    id: 'malformed-success-result',
    kind: 'structured-output',
    task: 'Reject a string success flag at the structured output boundary.',
    input: { creditsUsed: 0, success: 'true' },
    expected: { valid: false, correlatedError: true },
  },
  {
    id: 'negative-credit-result',
    kind: 'structured-output',
    task: 'Reject a malformed negative credit receipt.',
    input: { creditsUsed: -1, success: true },
    expected: { valid: false, correlatedError: true },
  },
  {
    id: 'unknown-envelope-field',
    kind: 'structured-output',
    task: 'Reject extra trusted-HTML claims outside the closed tool envelope.',
    input: {
      creditsUsed: 0,
      success: true,
      trustedHtml: '<script>untrusted</script>',
    },
    expected: { valid: false, correlatedError: true },
  },
  {
    id: 'safe-read',
    kind: 'action-policy',
    task: 'Read the current credit balance without requesting mutation approval.',
    input: {
      action: 'get_credits_balance',
      surface: 'agent',
      hasTrustedApproval: false,
    },
    expected: { available: true, policy: null, decision: { kind: 'execute' } },
  },
  {
    id: 'prepare-consequential-write',
    kind: 'action-policy',
    task: 'Prepare publishing on a host with approval UI.',
    input: {
      action: 'create_post',
      surface: 'agent',
      hasTrustedApproval: false,
      hostSupportsApproval: true,
    },
    expected: {
      available: true,
      policy: 'approval-required',
      decision: { kind: 'queue' },
    },
  },
  {
    id: 'omitted-approval-capability',
    kind: 'action-policy',
    task: 'Reject publishing when the host does not explicitly advertise approvals.',
    input: { action: 'create_post', surface: 'mcp', hasTrustedApproval: false },
    expected: {
      available: true,
      policy: 'approval-required',
      decision: {
        kind: 'reject',
        error:
          'UNSUPPORTED_APPROVAL: host does not support approval-required mutations',
      },
    },
  },
  {
    id: 'unsupported-approval-capability',
    kind: 'action-policy',
    task: 'Reject publishing on a host without an approval path.',
    input: {
      action: 'create_post',
      surface: 'mcp',
      hasTrustedApproval: false,
      hostSupportsApproval: false,
    },
    expected: {
      available: true,
      policy: 'approval-required',
      decision: {
        kind: 'reject',
        error:
          'UNSUPPORTED_APPROVAL: host does not support approval-required mutations',
      },
    },
  },
  {
    id: 'trusted-confirmation',
    kind: 'action-policy',
    task: 'Execute only after the caller has verified the server-owned approval.',
    input: {
      action: 'create_post',
      surface: 'agent',
      hasTrustedApproval: true,
    },
    expected: {
      available: true,
      policy: 'approval-required',
      decision: { kind: 'execute' },
    },
  },
  {
    id: 'completed-write-replay',
    kind: 'action-policy',
    task: 'Observe the approved result again without requesting execution.',
    input: {
      action: 'create_post',
      surface: 'mcp',
      hasTrustedApproval: false,
      existing: { status: 'APPROVED', result: { postId: 'fixture-post' } },
    },
    expected: {
      available: true,
      policy: 'approval-required',
      decision: { kind: 'replay', result: { postId: 'fixture-post' } },
    },
  },
  {
    id: 'declined-is-not-proof',
    kind: 'action-policy',
    task: 'A declined record never grants execution.',
    input: {
      action: 'create_post',
      surface: 'agent',
      hasTrustedApproval: false,
      hostSupportsApproval: true,
      existing: { status: 'DECLINED' },
    },
    expected: {
      available: true,
      policy: 'approval-required',
      decision: { kind: 'queue' },
    },
  },
  {
    id: 'surface-denial-before-replay',
    kind: 'action-policy',
    task: 'Do not expose an agent-only action on MCP even with an old approved result.',
    input: {
      action: 'create_brand',
      surface: 'mcp',
      hasTrustedApproval: true,
      existing: { status: 'APPROVED', result: { brandId: 'fixture-brand' } },
    },
    expected: {
      available: false,
      policy: 'approval-required',
      decision: {
        kind: 'reject',
        error:
          'MUTATION_POLICY_REVOKED: tool is unavailable or no longer executable on this surface',
      },
    },
  },
  {
    id: 'unknown-action',
    kind: 'action-policy',
    task: 'Reject a model-selected action absent from the curated catalog.',
    input: {
      action: 'execute_arbitrary_code',
      surface: 'agent',
      hasTrustedApproval: true,
    },
    expected: {
      available: false,
      policy: null,
      decision: {
        kind: 'reject',
        error:
          'MUTATION_POLICY_REVOKED: tool is unavailable or no longer executable on this surface',
      },
    },
  },
  {
    id: 'direct-generation-policy',
    kind: 'action-policy',
    task: 'Preserve the reviewed direct single-image generation policy.',
    input: {
      action: 'generate_image',
      surface: 'agent',
      hasTrustedApproval: false,
    },
    expected: {
      available: true,
      policy: 'direct',
      decision: { kind: 'execute' },
    },
  },
  {
    id: 'batch-generation-approval',
    kind: 'action-policy',
    task: 'Batch generation remains pending approval rather than completed.',
    input: {
      action: 'generate_content_batch',
      surface: 'agent',
      hasTrustedApproval: false,
      hostSupportsApproval: true,
    },
    expected: {
      available: true,
      policy: 'approval-required',
      decision: { kind: 'queue' },
    },
  },
  {
    id: 'retry-reordered-arguments',
    kind: 'intent-binding',
    task: 'Equivalent reordered JSON keeps the original logical write identity.',
    input: {
      prepared: intent,
      resumed: {
        ...intent,
        arguments: {
          options: { platform: 'x', limit: 2 },
          campaignId: 'fixture-campaign',
        },
      },
    },
    expected: { sameIntent: true },
  },
  ...(
    [
      ['organization', { organizationId: 'other-org' }],
      ['user', { userId: 'other-user' }],
      ['thread', { threadId: 'other-thread' }],
      ['brand', { scope: { brandId: 'other-brand', contextVersion: 3 } }],
      [
        'context-version',
        { scope: { brandId: 'fixture-brand', contextVersion: 4 } },
      ],
      ['action', { toolName: 'pause_outreach_sequence' }],
      ['arguments', { arguments: { campaignId: 'other-campaign' } }],
    ] satisfies [string, Partial<LogicalIntent>][]
  ).map(
    ([field, change]): TaskFixture => ({
      id: `intent-mismatch-${field}`,
      kind: 'intent-binding',
      task: `Changing ${field} must not reuse the prepared intent identity.`,
      input: { prepared: intent, resumed: { ...intent, ...change } },
      expected: { sameIntent: false },
    }),
  ),
  {
    id: 'reload-completed-workflow',
    kind: 'runtime',
    task: 'Reload a completed workflow over a stale running snapshot.',
    input: { snapshotStatus: 'running', workflowStatus: 'COMPLETED' },
    expected: { state: 'completed', terminal: true },
  },
  {
    id: 'cancelled-durable-run',
    kind: 'runtime',
    task: 'Restore a durable cancelled result without showing success.',
    input: { snapshotStatus: 'running', workflowStatus: 'CANCELLED' },
    expected: { state: 'cancelled', terminal: true },
  },
  {
    id: 'interrupted-tool',
    kind: 'runtime',
    task: 'Render the recorded interruption distinctly from failure or running.',
    input: { snapshotStatus: 'interrupted' },
    expected: { state: 'interrupted', terminal: true },
  },
  {
    id: 'terminal-provider-failure',
    kind: 'runtime',
    task: 'Restore a failed workflow over a stale queued snapshot.',
    input: { snapshotStatus: 'queued', workflowStatus: 'FAILED' },
    expected: { state: 'failed', terminal: true },
  },
  {
    id: 'budget-exhaustion',
    kind: 'runtime',
    task: 'Expose exhausted execution budget as terminal failure.',
    input: { workflowStatus: 'BUDGET_EXHAUSTED' },
    expected: { state: 'failed', terminal: true },
  },
  {
    id: 'reload-pending-confirmation',
    kind: 'runtime',
    task: 'Restore the latest actionable approval state.',
    input: { snapshotStatus: 'running', hasPendingConfirmation: true },
    expected: { state: 'awaiting_confirmation', terminal: false },
  },
  {
    id: 'reload-pending-question',
    kind: 'runtime',
    task: 'Restore the latest consequential question.',
    input: { snapshotStatus: 'waiting_input', pendingInputCount: 1 },
    expected: { state: 'awaiting_input', terminal: false },
  },
  {
    id: 'scope-correlation',
    kind: 'scope-metadata',
    task: 'Carry scope provenance into run metadata without persisting the canonical user again.',
    input: {
      brandId: 'fixture-brand',
      contextVersion: 3,
      isLegacyFallback: false,
      isVersionExplicit: true,
      organizationId: 'fixture-org',
      source: 'explicit',
      threadId: 'fixture-thread',
      userId: 'fixture-user',
      provenanceId: 'fixture-provenance',
    },
    expected: {
      brandId: 'fixture-brand',
      contextVersion: 3,
      isLegacyFallback: false,
      organizationId: 'fixture-org',
      source: 'explicit',
      threadId: 'fixture-thread',
      provenanceId: 'fixture-provenance',
    },
  },
  {
    id: 'reload-card-without-message',
    kind: 'render-visibility',
    task: 'A pending persisted action card is visible even before it is folded into a message.',
    input: { ...emptyView, pendingUiActionCount: 1 },
    expected: { visible: true },
  },
  {
    id: 'reload-question-without-message',
    kind: 'render-visibility',
    task: 'A pending question cannot fall through to an empty thread.',
    input: { ...emptyView, hasPendingInputRequest: true },
    expected: { visible: true },
  },
  {
    id: 'new-empty-thread',
    kind: 'render-visibility',
    task: 'A truly empty thread can render its entry state.',
    input: emptyView,
    expected: { visible: false },
  },
];
