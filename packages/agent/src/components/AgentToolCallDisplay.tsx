import { ToolCallDetailPanel } from '@genfeedai/agent/components/ToolCallDetailPanel';
import type { AgentToolCall } from '@genfeedai/agent/models/agent-chat.model';
import { formatDuration } from '@genfeedai/agent/utils/format-duration';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { type ReactElement, useState } from 'react';

interface AgentToolCallDisplayProps {
  toolCall: AgentToolCall & {
    creditsUsed?: number;
    durationMs?: number;
  };
}

export const TOOL_LABELS: Record<string, string> = {
  ai_action: 'AI Action',
  batch_approve_reject: 'Batch Approve/Reject',
  check_onboarding_status: 'Check Onboarding',
  complete_campaign: 'Complete Campaign',
  complete_onboarding: 'Complete Onboarding',
  connect_social_account: 'Connect Account',
  create_brand: 'Create Brand',
  create_campaign: 'Create Campaign',
  create_post: 'Create Post',
  create_workflow: 'Create Workflow',
  discover_engagements: 'Discover Engagements',
  draft_brand_voice_profile: 'Draft Brand Voice',
  draft_engagement_reply: 'Draft Reply',
  execute_workflow: 'Execute Workflow',
  generate_content: 'Generate Content',
  generate_content_batch: 'Batch Generate',
  generate_image: 'Generate Image',
  generate_monthly_content: 'Monthly Content',
  generate_onboarding_content: 'Generate Sample Content',
  generate_video: 'Generate Video',
  generate_voice: 'Generate Voice',
  get_analytics: 'Analytics',
  get_campaign_analytics: 'Campaign Analytics',
  get_connection_status: 'Connection Status',
  get_credits_balance: 'Credit Balance',
  get_current_brand: 'Current Brand',
  get_trends: 'Trends',
  initiate_oauth_connect: 'Connect Account',
  list_brands: 'List Brands',
  list_posts: 'List Posts',
  list_review_queue: 'Review Queue',
  list_workflows: 'List Workflows',
  open_studio_handoff: 'Open in Studio',
  pause_campaign: 'Pause Campaign',
  prepare_clip_workflow_run: 'Prepare Clip Run',
  prepare_generation: 'Prepare Generation',
  prepare_workflow_trigger: 'Prepare Workflow Trigger',
  present_payment_options: 'Payment Options',
  rate_content: 'Rate Content',
  rate_ingredient: 'Rate Ingredient',
  reframe_image: 'Reframe Image',
  resolve_handle: 'Resolve Handle',
  save_brand_voice_profile: 'Save Brand Voice',
  schedule_post: 'Schedule Post',
  start_campaign: 'Start Campaign',
  upscale_image: 'Upscale Image',
};

export function AgentToolCallDisplay({
  toolCall,
}: AgentToolCallDisplayProps): ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const label = TOOL_LABELS[toolCall.name] || toolCall.name;
  const isCompleted = toolCall.status === 'completed';
  const isFailed = toolCall.status === 'failed';

  return (
    <div className="my-1.5 border border-border bg-muted/50 text-xs">
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        {/* Status icon */}
        <span className="shrink-0">
          {isCompleted && (
            <svg
              aria-hidden="true"
              focusable="false"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-green-500"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {isFailed && (
            <svg
              aria-hidden="true"
              focusable="false"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-destructive"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
          {!isCompleted && !isFailed && (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
        </span>

        {/* Tool name */}
        <span className="font-medium text-foreground">{label}</span>

        {/* Status text */}
        <span
          className={
            isCompleted
              ? 'text-green-600'
              : isFailed
                ? 'text-destructive'
                : 'text-muted-foreground'
          }
        >
          {isCompleted ? 'Completed' : isFailed ? 'Failed' : 'Running'}
        </span>

        {/* Credits */}
        {toolCall.creditsUsed != null && toolCall.creditsUsed > 0 && (
          <span className="text-muted-foreground">
            {toolCall.creditsUsed} cr
          </span>
        )}

        {/* Duration */}
        {toolCall.durationMs != null && (
          <span className="text-muted-foreground">
            {formatDuration(toolCall.durationMs)}
          </span>
        )}

        {/* Expand chevron */}
        <svg
          aria-hidden="true"
          focusable="false"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`ml-auto shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </Button>

      {/* Expanded details */}
      {isExpanded && (
        <ToolCallDetailPanel
          error={toolCall.error}
          parameters={
            Object.keys(toolCall.arguments).length > 0
              ? toolCall.arguments
              : undefined
          }
          resultSummary={toolCall.resultSummary}
        />
      )}
    </div>
  );
}
