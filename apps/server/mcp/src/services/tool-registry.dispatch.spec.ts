import { ToolRegistryService } from '@mcp/services/tool-registry.service';

/**
 * Unit coverage for the dispatch classifier + boot-time drift guard. The
 * classifier is the single source of truth for which executor runs a tool; the
 * guard rejects any MCP-surfaced tool it cannot route (this is the check that
 * would have caught the ~25 dead-wired tools at boot instead of at call time).
 *
 * `@genfeedai/actions` is mocked so the guard sees a controllable registry;
 * `AgentToolName` (used by classify for the agent-executor branch) resolves
 * from the real `@genfeedai/interfaces` alias.
 */

const mockState = vi.hoisted(() => ({
  tools: [] as { name: string }[],
}));

vi.mock('@genfeedai/actions', () => ({
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
    // The system workflow catalog (#2223) is REST-backed on the workflows
    // collection, so both catalog tools stay on workflow-control even though
    // they are also AgentToolName members.
    ['list_system_workflow_catalog', 'workflow-control'],
    ['install_system_workflow', 'workflow-control'],
    ['generate_image', 'agent-executor'],
    ['get_video_status', 'legacy'],
    ['list_meta_campaigns', 'meta-ads'],
    ['get_google_ads_campaign_metrics', 'google-ads'],
    ['list_tiktok_campaigns', 'tiktok-ads'],
    ['list_tiktok_adgroups', 'tiktok-ads'],
    ['get_tiktok_top_performers', 'tiktok-ads'],
    // The platform-generic gateway tools own the `get_ads_` prefix; the
    // per-platform prefixes are checked first so they cannot be captured here.
    ['get_ads_adset_insights', 'ads-gateway'],
    ['get_ads_ad_insights', 'ads-gateway'],
    ['get_account_info', 'account-management'],
    ['post_social_reply', 'social-messages'],
    // generate_content_batch is an AgentToolName, so it routes through the
    // agent-executor to /agent-tools/:name/execute (re-surfaced in PR 5/6).
    ['generate_content_batch', 'agent-executor'],
    ['list_instagram_inspiration', 'agent-executor'],
    ['search_x_posts', 'agent-executor'],
    ['fetch_x_post', 'agent-executor'],
    ['list_x_account_activity', 'agent-executor'],
    ['create_instagram_remix_workflow', 'agent-executor'],
    ['create_ad_remix_workflow', 'agent-executor'],
    ['analyze_clip_project', 'clip-projects'],
    ['generate_clips', 'clip-projects'],
    ['get_clip_project', 'clip-projects'],
    ['get_scheduled_release', 'scheduler'],
    ['get_scheduler_capability', 'scheduler'],
    ['list_brand_publishing_readiness', 'scheduler'],
    ['list_scheduler_capabilities', 'scheduler'],
    ['update_scheduled_release', 'scheduler'],
    ['validate_scheduler_target', 'scheduler'],
    ['verify_skills_pro_entitlement', 'skills-pro'],
    ['install_skills_pro_skill', 'skills-pro'],
    ['brands__create', 'unknown'],
    ['content_plans__find_all', 'unknown'],
    ['a_tool_that_does_not_exist', 'unknown'],
    // The fleet/training/GPU fleet tools were dropped from the OSS MCP
    // surface in PR 5/6 (superadmin+IP-gated fleet API — a gf_ key can't reach
    // it); they no longer classify to an executor.
    ['control_comfyui', 'unknown'],
    ['start_training', 'unknown'],
    ['generate_fleet_content', 'unknown'],
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
      'generate_content_batch',
      'start_brand_interview',
      'submit_brand_interview_answer',
      'skip_brand_interview_question',
      'approve_social_draft',
      'post_social_reply',
      'send_social_dm',
      'analyze_clip_project',
      'create_clip_project_from_youtube',
      'generate_clips',
      'create_ad_remix_workflow',
      'create_instagram_remix_workflow',
      'create_scheduled_release',
      'update_scheduled_release',
      'control_scheduled_release',
      'install_skills_pro_skill',
    ];
    mockState.tools = [
      { name: 'generate_image' },
      { name: 'get_video_status' },
      { name: 'list_meta_campaigns' },
      { name: 'resolve_approval' },
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
