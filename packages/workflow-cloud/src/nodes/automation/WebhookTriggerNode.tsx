'use client';

import { WorkflowNodeStatus } from '@genfeedai/enums';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import { NodeBadge } from '@workflow-cloud/components/ui/badge';
import {
  NodeButton,
  NodeIconButton,
} from '@workflow-cloud/components/ui/button';
import {
  NodeCard,
  NodeDescription,
  NodeHeader,
} from '@workflow-cloud/components/ui/card';
import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  RefreshIcon,
  WebhookIcon,
} from '@workflow-cloud/components/ui/icons/node-icons';
import { NodeSelect } from '@workflow-cloud/components/ui/inputs';
import { useNodeExecution } from '@workflow-cloud/hooks/useNodeExecution';
import { coerceNodeData } from '@workflow-cloud/nodes/node-data';
import type { WebhookTriggerNodeData } from '@workflow-cloud/nodes/types';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback, useState } from 'react';

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
  }, [id, getService, updateNodeData]);

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
        icon={<WebhookIcon />}
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
          icon={<WebhookIcon />}
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
              <code className="flex-1 px-2 py-1.5 text-xs bg-muted font-mono truncate">
                {data.webhookUrl}
              </code>
              <NodeIconButton
                onClick={() => copyToClipboard(data.webhookUrl!, 'url')}
                title="Copy URL"
              >
                {copied === 'url' ? <CheckIcon /> : <CopyIcon />}
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
                <code className="flex-1 px-2 py-1.5 text-xs bg-muted font-mono truncate">
                  {showSecret
                    ? data.webhookSecret
                    : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                </code>
                <NodeIconButton
                  onClick={() => setShowSecret(!showSecret)}
                  title={showSecret ? 'Hide secret' : 'Show secret'}
                >
                  {showSecret ? <EyeOffIcon /> : <EyeIcon />}
                </NodeIconButton>
                <NodeIconButton
                  onClick={() => copyToClipboard(data.webhookSecret!, 'secret')}
                  title="Copy secret"
                >
                  {copied === 'secret' ? <CheckIcon /> : <CopyIcon />}
                </NodeIconButton>
                <NodeIconButton
                  onClick={handleRegenerateSecret}
                  title="Regenerate secret"
                >
                  <RefreshIcon />
                </NodeIconButton>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {authHeaderText}
              </p>
            </div>
          )}

          {/* Usage Example */}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              View example request
            </summary>
            <pre className="mt-2 p-2 bg-muted overflow-x-auto text-[10px]">
              {`curl -X POST "${data.webhookUrl}" \\
  -H "Content-Type: application/json" \\${curlAuthHeader}
  -d '{"key": "value"}'`}
            </pre>
          </details>

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
