'use client';

import {
  NotificationChannel,
  ReviewGateStatus,
  WorkflowNodeStatus,
} from '@genfeedai/enums';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import { logger } from '@services/core/logger.service';
import { NodeBadge } from '@workflow-cloud/components/ui/badge';
import {
  NodeButton,
  SelectableButton,
} from '@workflow-cloud/components/ui/button';
import {
  NodeCard,
  NodeDescription,
  NodeHeader,
} from '@workflow-cloud/components/ui/card';
import {
  CheckIcon,
  ClockIcon,
  MailIcon,
  ShieldCheckIcon,
  SlackIcon,
  WebhookIcon,
  XIcon,
} from '@workflow-cloud/components/ui/icons/node-icons';
import { NodeInput } from '@workflow-cloud/components/ui/inputs';
import { MediaPreview } from '@workflow-cloud/components/ui/media';
import { HelpText } from '@workflow-cloud/components/ui/status';
import Toggle from '@workflow-cloud/components/ui/toggle/Toggle';
import { useNodeExecution } from '@workflow-cloud/hooks/useNodeExecution';
import { coerceNodeData } from '@workflow-cloud/nodes/node-data';
import type { ReviewGateNodeData } from '@workflow-cloud/nodes/types';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback } from 'react';

function getStatusBadge(
  status: ReviewGateNodeData['approvalStatus'],
): React.JSX.Element {
  const badges: Record<
    ReviewGateStatus,
    {
      icon: React.JSX.Element;
      label: string;
      variant: 'green' | 'orange' | 'red' | 'yellow';
    }
  > = {
    [ReviewGateStatus.APPROVED]: {
      icon: <CheckIcon />,
      label: 'Approved',
      variant: 'green' as const,
    },
    [ReviewGateStatus.PENDING]: {
      icon: <ClockIcon />,
      label: 'Pending',
      variant: 'orange' as const,
    },
    [ReviewGateStatus.REJECTED]: {
      icon: <XIcon />,
      label: 'Rejected',
      variant: 'red' as const,
    },
    [ReviewGateStatus.TIMEOUT]: {
      icon: <ClockIcon />,
      label: 'Timeout',
      variant: 'yellow' as const,
    },
  };
  const badge = badges[status];
  return (
    <NodeBadge variant={badge.variant}>
      {badge.icon}
      {badge.label}
    </NodeBadge>
  );
}

const CHANNEL_CONFIG: Record<
  NotificationChannel,
  { icon: React.JSX.Element; label: string }
> = {
  [NotificationChannel.EMAIL]: { icon: <MailIcon />, label: 'Email' },
  [NotificationChannel.SLACK]: { icon: <SlackIcon />, label: 'Slack' },
  [NotificationChannel.WEBHOOK]: { icon: <WebhookIcon />, label: 'Webhook' },
};

function ReviewGateNodeComponent(props: NodeProps): React.JSX.Element {
  const { id } = props;
  const data = coerceNodeData<ReviewGateNodeData>(
    props.data,
    reviewGateNodeDefaults,
  );
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const { getService } = useNodeExecution();

  const handleNotifyChannelToggle = useCallback(
    (channel: NotificationChannel) => {
      const current = data.notifyChannels || [];
      const updated = current.includes(channel)
        ? current.filter((c) => c !== channel)
        : [...current, channel];
      updateNodeData(id, { notifyChannels: updated });
    },
    [id, data.notifyChannels, updateNodeData],
  );

  const handleInputChange = useCallback(
    (field: 'notifyEmail' | 'webhookUrl' | 'slackChannel') =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        updateNodeData(id, { [field]: e.target.value });
      },
    [id, updateNodeData],
  );

  const handleTimeoutChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { timeoutHours: parseInt(e.target.value, 10) || 24 });
    },
    [id, updateNodeData],
  );

  const handleAutoApproveToggle = useCallback(() => {
    updateNodeData(id, {
      autoApproveIfNoResponse: !data.autoApproveIfNoResponse,
    });
  }, [id, data.autoApproveIfNoResponse, updateNodeData]);

  const handleApprove = useCallback(async () => {
    const workflowId = useWorkflowStore.getState().workflowId;
    if (!workflowId || !data.approvalId) {
      return;
    }

    try {
      const service = await getService();
      const result = await service.submitApproval(
        workflowId,
        data.approvalId,
        id,
        true,
      );
      updateNodeData(id, {
        approvalStatus: ReviewGateStatus.APPROVED,
        approvedAt: result.approvedAt,
        approvedBy: result.approvedBy,
        error: undefined,
        outputCaption: data.inputCaption,
        outputMedia: data.inputMedia,
        status: WorkflowNodeStatus.IDLE,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to approve review';
      logger.error('Review gate approval failed', {
        approvalId: data.approvalId,
        error,
        nodeId: id,
        workflowId,
      });
      updateNodeData(id, {
        error: message,
        status: WorkflowNodeStatus.ERROR,
      });
    }
  }, [
    id,
    data.approvalId,
    data.inputMedia,
    data.inputCaption,
    getService,
    updateNodeData,
  ]);

  const handleReject = useCallback(async () => {
    const workflowId = useWorkflowStore.getState().workflowId;
    if (!workflowId || !data.approvalId) {
      return;
    }

    try {
      const service = await getService();
      await service.submitApproval(
        workflowId,
        data.approvalId,
        id,
        false,
        'Rejected via review gate',
      );
      updateNodeData(id, {
        approvalStatus: ReviewGateStatus.REJECTED,
        error: undefined,
        rejectionReason: 'Rejected via review gate',
        status: WorkflowNodeStatus.IDLE,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to reject review';
      logger.error('Review gate rejection failed', {
        approvalId: data.approvalId,
        error,
        nodeId: id,
        workflowId,
      });
      updateNodeData(id, {
        error: message,
        status: WorkflowNodeStatus.ERROR,
      });
    }
  }, [id, data.approvalId, getService, updateNodeData]);

  const isPending = data.approvalStatus === ReviewGateStatus.PENDING;
  const hasReviewInput = Boolean(data.inputMedia || data.inputCaption);
  const showApprovalButtons =
    isPending && hasReviewInput && Boolean(data.approvalId);

  return (
    <NodeCard minWidth="300px">
      <NodeHeader
        icon={<ShieldCheckIcon />}
        title="Review Gate"
        badge={getStatusBadge(data.approvalStatus)}
      />

      <NodeDescription>
        Pause workflow for human review and approval before proceeding.
      </NodeDescription>

      {/* Media Preview */}
      {data.inputMedia && (
        <MediaPreview
          src={data.inputMedia}
          type={data.inputType}
          controls={data.inputType === 'video'}
          autoPlay={false}
        />
      )}

      {/* Caption preview */}
      {data.inputCaption && (
        <div className="p-2 border border-white/[0.08] bg-muted/30 text-xs max-h-16 overflow-y-auto">
          {data.inputCaption}
        </div>
      )}

      {/* Notification Channels */}
      {isPending && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Notify via</label>
          <div className="flex gap-2">
            {(
              Object.entries(CHANNEL_CONFIG) as [
                NotificationChannel,
                (typeof CHANNEL_CONFIG)[NotificationChannel],
              ][]
            ).map(([channel, config]) => (
              <SelectableButton
                key={channel}
                selected={data.notifyChannels?.includes(channel) ?? false}
                onClick={() => handleNotifyChannelToggle(channel)}
                icon={config.icon}
              >
                {config.label}
              </SelectableButton>
            ))}
          </div>

          {data.notifyChannels?.includes(NotificationChannel.EMAIL) && (
            <NodeInput
              type="email"
              value={data.notifyEmail || ''}
              onChange={handleInputChange('notifyEmail')}
              placeholder="reviewer@company.com"
            />
          )}

          {data.notifyChannels?.includes(NotificationChannel.WEBHOOK) && (
            <NodeInput
              type="url"
              value={data.webhookUrl || ''}
              onChange={handleInputChange('webhookUrl')}
              placeholder="https://example.com/webhook"
            />
          )}

          {data.notifyChannels?.includes(NotificationChannel.SLACK) && (
            <NodeInput
              type="text"
              value={data.slackChannel || ''}
              onChange={handleInputChange('slackChannel')}
              placeholder="#content-review"
            />
          )}
        </div>
      )}

      {/* Timeout settings */}
      {isPending && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm">Timeout (hours)</label>
            <input
              type="number"
              value={data.timeoutHours}
              onChange={handleTimeoutChange}
              min={1}
              max={168}
              className="w-20 px-2 py-1 text-sm bg-background border border-white/[0.08] focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm">Auto-approve on timeout</label>
            <Toggle
              checked={data.autoApproveIfNoResponse}
              onChange={handleAutoApproveToggle}
            />
          </div>
        </div>
      )}

      {/* Approval actions */}
      {showApprovalButtons && (
        <div className="flex gap-2">
          <NodeButton
            variant="success"
            fullWidth
            onClick={handleApprove}
            icon={<CheckIcon />}
          >
            Approve
          </NodeButton>
          <NodeButton
            variant="danger"
            fullWidth
            onClick={handleReject}
            icon={<XIcon />}
          >
            Reject
          </NodeButton>
        </div>
      )}

      {/* Status details */}
      {data.approvalStatus === ReviewGateStatus.APPROVED && data.approvedBy && (
        <div className="text-xs text-muted-foreground">
          Approved by {data.approvedBy} at{' '}
          {data.approvedAt ? new Date(data.approvedAt).toLocaleString() : 'N/A'}
        </div>
      )}

      {data.approvalStatus === ReviewGateStatus.REJECTED && (
        <div className="text-xs text-red-500">
          {data.rejectionReason || 'No reason provided'}
        </div>
      )}

      {isPending && !hasReviewInput && (
        <HelpText>Waiting for content to review...</HelpText>
      )}

      {isPending && hasReviewInput && !data.approvalId && (
        <HelpText>
          Waiting for the active execution to attach approval context...
        </HelpText>
      )}

      {data.error && (
        <div className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-300">
          {data.error}
        </div>
      )}
    </NodeCard>
  );
}

export const ReviewGateNode = memo(ReviewGateNodeComponent);

export const reviewGateNodeDefaults: Partial<ReviewGateNodeData> = {
  approvalId: null,
  approvalStatus: ReviewGateStatus.PENDING,
  autoApproveIfNoResponse: false,
  inputCaption: null,
  inputMedia: null,
  inputType: null,
  label: 'Review Gate',
  notifyChannels: [NotificationChannel.EMAIL],
  outputCaption: null,
  outputMedia: null,
  status: WorkflowNodeStatus.IDLE,
  timeoutHours: 24,
};
