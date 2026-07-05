import { ToolRegistryService } from '@mcp/services/tool-registry.service';

/**
 * Unit coverage for the dispatch classifier + boot-time drift guard. The
 * classifier is the single source of truth for which executor runs a tool; the
 * guard rejects any MCP-surfaced tool it cannot route (this is the check that
 * would have caught the ~25 dead-wired tools at boot instead of at call time).
 *
 * `@genfeedai/tools` is mocked so the guard sees a controllable registry;
 * `AgentToolName` (used by classify for the agent-executor branch) resolves
 * from the real `@genfeedai/interfaces` alias.
 */

const mockState = vi.hoisted(() => ({
  tools: [] as { name: string }[],
}));

vi.mock('@genfeedai/tools', () => ({
  getToolByName: vi.fn(),
  getToolsForSurface: vi.fn(() => mockState.tools),
  toMcpTools: vi.fn((tools) => tools),
}));

describe('ToolRegistryService.classify', () => {
  it.each([
    ['send_chat_message', 'agent-chat'],
    // inspect_workflow is BOTH an AgentToolName and a workflow-control tool;
    // precedence must keep it on workflow-control (checked first).
    ['inspect_workflow', 'workflow-control'],
    ['generate_image', 'agent-executor'],
    ['get_video_status', 'legacy'],
    ['list_meta_campaigns', 'meta-ads'],
    ['get_google_ads_campaign_metrics', 'google-ads'],
    ['get_account_info', 'account-management'],
    ['control_comfyui', 'admin-infrastructure'],
    ['start_training', 'training-pipeline'],
    ['generate_darkroom_content', 'darkroom-generation'],
    ['post_social_reply', 'social-messages'],
    // OpenAPI-generated tools (#1248): the `__` namespace routes to the
    // generated executor kind so the boot drift guard stays green pre-#1249.
    ['brands__create', 'generated'],
    ['content_plans__find_all', 'generated'],
    ['a_tool_that_does_not_exist', 'unknown'],
    // resolve_approval is handled upstream in handleToolCall, so it is not a
    // classify-dispatch target.
    ['resolve_approval', 'unknown'],
  ])('classifies %s as %s', (name, kind) => {
    expect(ToolRegistryService.classify(name)).toBe(kind);
  });
});

describe('ToolRegistryService.validateDispatchCoverage', () => {
  it('passes when every surfaced tool routes (resolve_approval excepted)', () => {
    // Every APPROVAL_REQUIRED_TOOLS name must be surfaced (the guard's second
    // check), plus a routable sample and the pre-dispatch resolve_approval.
    const approvalGated = [
      'create_post',
      'create_article',
      'create_avatar',
      'start_training',
      'delete_dataset',
      'control_comfyui',
      'run_captioning',
      'generate_face_test',
      'generate_bootstrap',
      'generate_pulid',
      'generate_darkroom_content',
      'start_brand_interview',
      'submit_brand_interview_answer',
      'skip_brand_interview_question',
      'approve_social_draft',
      'post_social_reply',
      'send_social_dm',
    ];
    mockState.tools = [
      { name: 'generate_image' },
      { name: 'get_video_status' },
      { name: 'list_meta_campaigns' },
      { name: 'resolve_approval' },
      // A generated tool must route (to the 'generated' kind), not trip the
      // guard, even though its dispatcher does not exist yet (#1249).
      { name: 'brands__create' },
      ...approvalGated.map((name) => ({ name })),
    ];
    expect(() => ToolRegistryService.validateDispatchCoverage()).not.toThrow();
  });

  it('throws when a surfaced tool has no executor', () => {
    mockState.tools = [
      { name: 'generate_image' },
      { name: 'totally_unrouted_tool' },
    ];
    expect(() => ToolRegistryService.validateDispatchCoverage()).toThrow(
      /no executor dispatch for \[totally_unrouted_tool\]/,
    );
  });

  it('throws when an approval-gated tool is not surfaced', () => {
    // create_post is in APPROVAL_REQUIRED_TOOLS; omitting it from the surfaced
    // set must trip the approval-gate drift check.
    mockState.tools = [{ name: 'generate_image' }];
    expect(() => ToolRegistryService.validateDispatchCoverage()).toThrow(
      /approval-gate drift/,
    );
  });
});
