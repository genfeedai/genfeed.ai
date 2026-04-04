'use client';

import { AgentReplyStyle } from '@genfeedai/enums';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import SettingsAgentsPage from '@pages/settings/agents/settings-agents-page';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives';
import { useCallback, useState } from 'react';

const REPLY_STYLE_OPTIONS: Array<{ label: string; value: AgentReplyStyle }> = [
  { label: 'Concise', value: AgentReplyStyle.CONCISE },
  { label: 'Detailed', value: AgentReplyStyle.DETAILED },
  { label: 'Friendly', value: AgentReplyStyle.FRIENDLY },
  { label: 'Professional', value: AgentReplyStyle.PROFESSIONAL },
];

export default function SettingsOrganizationPolicyPage() {
  const { settings, updateSettings } = useOrganization();
  const [isSavingReplyStyle, setIsSavingReplyStyle] = useState(false);

  const handleReplyStyleChange = useCallback(
    async (value: string) => {
      setIsSavingReplyStyle(true);
      try {
        await updateSettings('agentReplyStyle', value as AgentReplyStyle);
      } catch (error) {
        logger.error('Failed to update organization reply style', error);
      } finally {
        setIsSavingReplyStyle(false);
      }
    },
    [updateSettings],
  );

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Assistant Reply Style</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">Organization Default</p>
            <Select
              value={settings?.agentReplyStyle ?? AgentReplyStyle.CONCISE}
              disabled={isSavingReplyStyle}
              onValueChange={handleReplyStyleChange}
            >
              <SelectTrigger className="w-full mt-2 rounded">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPLY_STYLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            Controls the default style the assistant uses across the workspace.
            Personal chat defaults and brand voice are configured elsewhere.
          </p>
        </div>
      </Card>

      <SettingsAgentsPage />
    </div>
  );
}
