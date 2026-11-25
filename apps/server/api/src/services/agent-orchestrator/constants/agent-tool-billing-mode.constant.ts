/**
 * Who charges a priced agent tool.
 *
 * - Orchestrator-billed: the tool never charges itself. The turn runner holds
 *   the catalog price before the tool runs, settles the hold when the tool
 *   succeeds and releases it when the tool fails, is cancelled or only asks
 *   for approval.
 * - Self-billed: the tool deducts or holds its own (often variable) cost, so a
 *   hold taken by the runner would reserve the same credits twice and refuse an
 *   organization whose balance covers the tool once.
 *
 * The mode is a property of the tool, not of its result: a result only says
 * who billed after the tool already ran, too late to hold anything.
 * `agent-tool-billing-mode.constant.spec.ts` fails when a priced catalog tool
 * is in neither list, so a new priced tool forces this decision.
 */
export const ORCHESTRATOR_BILLED_AGENT_TOOLS: ReadonlySet<string> = new Set([
  'create_outreach_sequence',
  'discover_engagements',
  'draft_brand_voice_profile',
  'draft_engagement_reply',
  'draft_x_quote',
  'draft_x_repost',
  'generate_monthly_content',
  'review_turbo_items',
  'schedule_post',
]);

export const SELF_BILLED_AGENT_TOOLS: ReadonlySet<string> = new Set([
  'ai_action',
  'create_brand_from_url',
  'draft_thread',
  'enhance_prompt',
  'fetch_x_account_activity',
  'fetch_x_posts',
  'generate',
  'generate_as_identity',
  'generate_content',
  'generate_reply_variants',
  'generate_turbo_content',
  'refine_text',
  'repurpose_post',
]);

export function isOrchestratorBilledAgentTool(toolName: string): boolean {
  return ORCHESTRATOR_BILLED_AGENT_TOOLS.has(toolName);
}
