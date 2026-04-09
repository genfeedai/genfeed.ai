'use client';

import { WorkflowNodeStatus } from '@genfeedai/enums';
import { Code, Pre } from '@genfeedai/ui';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback, useState } from 'react';
import { NodeBadge } from '@/features/workflows/components/ui/badge';
import {
  NodeButton,
  NodeIconButton,
} from '@/features/workflows/components/ui/button';
import {
  NodeCard,
  NodeDescription,
  NodeHeader,
} from '@/features/workflows/components/ui/card';
import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  RefreshIcon,
  WebhookIcon,
} from '@/features/workflows/components/ui/icons';
import { NodeSelect } from '@/features/workflows/components/ui/inputs';
import { useNodeExecution } from '@/features/workflows/hooks/useNodeExecution';
import { coerceNodeData } from '@/features/workflows/nodes/node-data';
import type { WebhookTriggerNodeData } from '@/features/workflows/nodes/types';

function WebhookTriggerNodeComponent(props: NodeProps): React.JSX.Element {
  const { id } = props;
  const data = coerceNodeData<WebhookTriggerNodeData>(
    props.data,
    webhookTriggerNodeDefaults,
  );
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const { getService } = useNodeExecution();
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState<'url' | 'secret' | null>(null);

  const handleAuthTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, {
        authType: e.target.value as WebhookTriggerNodeData['authType'],
      });
    },
    [id, updateNodeData],
  );

  const handleGenerateWebhook = useCallback(async () => {
    const workflowId = useWorkflowStore.getState().workflowId;
    if (!workflowId) {
      return;
    }

    try {
      const service = await getService();
      const webhook = await service.createWebhook(workflowId, data.authType);
      updateNodeData(id, {
        authType: webhook.authType,
        lastTriggeredAt: webhook.lastTriggeredAt,
        triggerCount: webhook.triggerCount,
        webhookId: webhook.webhookId,
        webhookSecret: webhook.webhookSecret,
        webhookUrl: webhook.webhookUrl,
      });
    } catch {
      // Webhook generation failed
    }
  }, [id, getService, updateNodeData, data.authType]);

  const handleRegenerateSecret = useCallback(async () => {
    const workflowId = useWorkflowStore.getState().workflowId;
    if (!workflowId) {
      return;
    }

    try {
      const service = await getService();
      const webhook = await service.regenerateWebhookSecret(workflowId);
      updateNodeData(id, {
        webhookSecret: webhook.webhookSecret,
      });
    } catch {
      // Secret regeneration failed
    }
  }, [id, getService, updateNodeData]);

  const copyToClipboard = useCallback(
    async (text: string, type: 'url' | 'secret') => {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    },
    [],
  );

  const authHeaderText =
    data.authType === 'bearer'
      ? 'Include in Authorization header: Bearer {token}'
      : 'Include in X-Webhook-Secret header';

  const curlAuthHeader =
    data.authType === 'secret'
      ? `\n  -H "X-Webhook-Secret: ${showSecret ? data.webhookSecret : 'YOUR_SECRET'}" \\`
      : data.authType === 'bearer'
        ? `\n  -H "Authorization: Bearer ${showSecret ? data.webhookSecret : 'YOUR_TOKEN'}" \\`
        : '';

  return (
    <NodeCard minWidth="300px">
      <NodeHeader
        icon={<WebhookIcon className="h-4 w-4" />}
        title="Webhook Trigger"
        badge={<NodeBadge variant="blue">Trigger</NodeBadge>}
      />

      <NodeDescription>
        Trigger this workflow from external tools like Zapier, n8n, or custom
        integrations.
      </NodeDescription>

      {!data.webhookUrl && (
        <NodeButton
          fullWidth
          onClick={handleGenerateWebhook}
          icon={<WebhookIcon className="h-4 w-4" />}
        >
          Generate Webhook URL
        </NodeButton>
      )}

      {data.webhookUrl && (
        <div className="space-y-3">
          {/* URL Display */}
          <div>
            <label className="text-xs text-muted-foreground">Webhook URL</label>
            <div className="flex items-center gap-2 mt-1">
              <Code className="flex-1 truncate">{data.webhookUrl}</Code>
              <NodeIconButton
                onClick={() => copyToClipboard(data.webhookUrl!, 'url')}
                title="Copy URL"
              >
                {copied === 'url' ? (
                  <CheckIcon className="h-4 w-4" />
                ) : (
                  <CopyIcon className="h-4 w-4" />
                )}
              </NodeIconButton>
            </div>
          </div>

          <NodeSelect
            label="Authentication"
            value={data.authType}
            onChange={handleAuthTypeChange}
          >
            <option value="none">No authentication</option>
            <option value="secret">Secret header (X-Webhook-Secret)</option>
            <option value="bearer">Bearer token</option>
          </NodeSelect>

          {/* Secret Display */}
          {data.authType !== 'none' && data.webhookSecret && (
            <div>
              <label className="text-xs text-muted-foreground">
                {data.authType === 'bearer' ? 'Bearer Token' : 'Secret Key'}
              </label>
              <div className="flex items-center gap-2 mt-1">
                <Code className="flex-1 truncate">
                  {showSecret
                    ? data.webhookSecret
                    : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                </Code>
                <NodeIconButton
                  onClick={() => setShowSecret(!showSecret)}
                  title={showSecret ? 'Hide secret' : 'Show secret'}
                >
                  {showSecret ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </NodeIconButton>
                <NodeIconButton
                  onClick={() => copyToClipboard(data.webhookSecret!, 'secret')}
                  title="Copy secret"
                >
                  {copied === 'secret' ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : (
                    <CopyIcon className="h-4 w-4" />
                  )}
                </NodeIconButton>
                <NodeIconButton
                  onClick={handleRegenerateSecret}
                  title="Regenerate secret"
                >
                  <RefreshIcon className="h-4 w-4" />
                </NodeIconButton>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {authHeaderText}
              </p>
            </div>
          )}

          {/* Usage Example */}
          <Collapsible className="text-xs">
            <CollapsibleTrigger
              showArrow={false}
              className="cursor-pointer py-0 text-muted-foreground hover:text-foreground hover:no-underline"
            >
              View example request
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Pre size="xs" className="mt-2">
                {`curl -X POST "${data.webhookUrl}" \\
  -H "Content-Type: application/json" \\${curlAuthHeader}
  -d '{"key": "value"}'`}
              </Pre>
            </CollapsibleContent>
          </Collapsible>

          {/* Stats */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-white/[0.08]">
            <span>Triggers: {data.triggerCount}</span>
            {data.lastTriggeredAt && (
              <span>
                Last: {new Date(data.lastTriggeredAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      )}
    </NodeCard>
  );
}

export const WebhookTriggerNode = memo(WebhookTriggerNodeComponent);

export const webhookTriggerNodeDefaults: Partial<WebhookTriggerNodeData> = {
  authType: 'secret',
  label: 'Webhook Trigger',
  lastTriggeredAt: null,
  outputPayload: null,
  status: WorkflowNodeStatus.IDLE,
  triggerCount: 0,
  webhookId: null,
  webhookSecret: null,
  webhookUrl: null,
};
