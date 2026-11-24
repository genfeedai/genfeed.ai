'use client';

import {
  ButtonSize,
  ButtonVariant,
  NotificationChannel,
  ReviewGateStatus,
  WorkflowNodeStatus,
} from '@genfeedai/contracts';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflows/ui/stores';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import { Alert } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { Switch } from '@ui/primitives/switch';
import DateText from '@ui/time/DateText';
import type { NodeProps } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { memo, useCallback } from 'react';
import {
  NodeDescription,
  NodeHeader,
} from '@/features/workflows/components/ui/card';
import {
  CheckIcon,
  ClockIcon,
  MailIcon,
  ShieldCheckIcon,
  SlackIcon,
  WebhookIcon,
  XIcon,
} from '@/features/workflows/components/ui/icons';
import { MediaPreview } from '@/features/workflows/components/ui/media';
import { HelpText } from '@/features/workflows/components/ui/status';
import { useNodeExecution } from '@/features/workflows/hooks/useNodeExecution';
import { coerceNodeData } from '@/features/workflows/nodes/node-data';
import type { ReviewGateNodeData } from '@/features/workflows/nodes/types';

function getStatusBadge(
  status: ReviewGateNodeData['approvalStatus'],
): React.JSX.Element {
  const badges: Record<
    ReviewGateStatus,
    {
      icon: React.JSX.Element;
      label: string;
      variant: 'destructive' | 'success' | 'warning';
    }
  > = {
    [ReviewGateStatus.APPROVED]: {
      icon: <CheckIcon />,
      label: 'Approved',
      variant: 'success' as const,
    },
    [ReviewGateStatus.PENDING]: {
      icon: <ClockIcon />,
      label: 'Pending',
      variant: 'warning' as const,
    },
    [ReviewGateStatus.REJECTED]: {
      icon: <XIcon />,
      label: 'Rejected',
      variant: 'destructive' as const,
    },
    [ReviewGateStatus.TIMEOUT]: {
      icon: <ClockIcon />,
      label: 'Timeout',
      variant: 'warning' as const,
    },
  };
  const badge = badges[status];
  return (
    <Badge icon={badge.icon} shape="pill" size="lg" variant={badge.variant}>
      {badge.label}
    </Badge>
  );
}

const CHANNEL_CONFIG: Record<
  NotificationChannel,
  { icon: React.JSX.Element; label: string }
> = {
  [NotificationChannel.EMAIL]: {
    icon: <MailIcon className="size-4" />,
    label: 'Email',
  },
  [NotificationChannel.SLACK]: {
    icon: <SlackIcon className="size-4" />,
    label: 'Slack',
  },
  [NotificationChannel.WEBHOOK]: {
    icon: <WebhookIcon className="size-4" />,
    label: 'Webhook',
  },
  [NotificationChannel.TASK_INBOX]: {
    icon: <ShieldCheckIcon className="size-4" />,
    label: 'Task Inbox',
  },
};

function ReviewGateNodeComponent(props: NodeProps): React.JSX.Element {
  const selectionLabels = useTranslations('ui.selectionGroups');
  const { id } = props;
  const data = coerceNodeData<ReviewGateNodeData>(
    props.data,
    reviewGateNodeDefaults,
  );
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const { getService } = useNodeExecution();

  const handleNotifyChannelsChange = useCallback(
    (channels: NotificationChannel[]) => {
      updateNodeData(id, { notifyChannels: channels });
    },
    [id, updateNodeData],
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
  const isRejected = data.approvalStatus === ReviewGateStatus.REJECTED;
  const isErrorShownAsRejectionReason =
    isRejected && data.error === data.rejectionReason;
  const hasReviewInput = Boolean(data.inputMedia || data.inputCaption);
  const showApprovalButtons =
    isPending && hasReviewInput && Boolean(data.approvalId);

  return (
    <Card className="min-w-[300px]">
      <NodeHeader
        icon={<ShieldCheckIcon className="size-4" />}
        title="Review Gate"
        badge={getStatusBadge(data.approvalStatus)}
      />

      <NodeDescription>
        Pause workflow for human review and approval before proceeding.
      </NodeDescription>

      {data.inputMedia && (
        <MediaPreview
          src={data.inputMedia}
          type={data.inputType}
          controls={data.inputType === 'video' || data.inputType === 'audio'}
          autoPlay={false}
        />
      )}

      {data.inputCaption && (
        <div className="p-2 bg-tertiary text-xs max-h-16 overflow-y-auto">
          {data.inputCaption}
        </div>
      )}

      {isPending && (
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground">Notify via</span>
          <OptionTileGroup
            ariaLabel={selectionLabels('notifyVia')}
            columns={2}
            onValueChange={handleNotifyChannelsChange}
            type="multiple"
            value={data.notifyChannels ?? []}
          >
            {Object.values(NotificationChannel).map((channel) => (
              <OptionTile
                icon={CHANNEL_CONFIG[channel].icon}
                key={channel}
                size="sm"
                title={CHANNEL_CONFIG[channel].label}
                value={channel}
              />
            ))}
          </OptionTileGroup>

          {data.notifyChannels?.includes(NotificationChannel.EMAIL) && (
            <Input
              type="email"
              value={data.notifyEmail || ''}
              onChange={handleInputChange('notifyEmail')}
              placeholder="reviewer@company.com"
            />
          )}

          {data.notifyChannels?.includes(NotificationChannel.WEBHOOK) && (
            <Input
              type="url"
              value={data.webhookUrl || ''}
              onChange={handleInputChange('webhookUrl')}
              placeholder="https://example.com/webhook"
            />
          )}

          {data.notifyChannels?.includes(NotificationChannel.SLACK) && (
            <Input
              type="text"
              value={data.slackChannel || ''}
              onChange={handleInputChange('slackChannel')}
              placeholder="#content-review"
            />
          )}
        </div>
      )}

      {isPending && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Timeout (hours)</span>
            <Input
              type="number"
              value={data.timeoutHours}
              onChange={handleTimeoutChange}
              min={1}
              max={168}
              className="w-20"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Auto-approve on timeout</span>
            <Switch
              checked={data.autoApproveIfNoResponse}
              onCheckedChange={handleAutoApproveToggle}
              size="sm"
            />
          </div>
        </div>
      )}

      {showApprovalButtons && (
        <div className="flex gap-2">
          <Button
            className="w-full"
            size={ButtonSize.SM}
            textTransform="none"
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
            onClick={handleApprove}
            icon={<CheckIcon className="size-4" />}
          >
            Approve
          </Button>
          <Button
            className="w-full"
            size={ButtonSize.SM}
            textTransform="none"
            variant={ButtonVariant.DESTRUCTIVE}
            withWrapper={false}
            onClick={handleReject}
            icon={<XIcon className="size-4" />}
          >
            Reject
          </Button>
        </div>
      )}

      {data.approvalStatus === ReviewGateStatus.APPROVED && data.approvedBy && (
        <div className="text-xs text-muted-foreground">
          Approved by {data.approvedBy}
          {data.approvedAt ? (
            <>
              {' '}
              at <DateText value={data.approvedAt} />
            </>
          ) : null}
        </div>
      )}

      {isRejected && (
        <div className="text-xs text-destructive">
          {data.rejectionReason || 'No reason provided'}
        </div>
      )}

      {isPending && !hasReviewInput && (
        <HelpText>Waiting for content to review…</HelpText>
      )}

      {isPending && hasReviewInput && !data.approvalId && (
        <HelpText>
          Waiting for the active execution to attach approval context…
        </HelpText>
      )}

      {data.error && !isErrorShownAsRejectionReason && (
        <Alert size="sm" variant="destructive">
          {data.error}
        </Alert>
      )}
    </Card>
  );
}

export const ReviewGateNode = memo(ReviewGateNodeComponent);

const reviewGateNodeDefaults: Partial<ReviewGateNodeData> = {
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
