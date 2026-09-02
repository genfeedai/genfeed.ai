'use client';

import { AgentReplyStyle } from '@genfeedai/contracts';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
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
import SettingsAgentsPage from './settings-agents-page';

const REPLY_STYLE_OPTIONS: Array<{ label: string; value: AgentReplyStyle }> = [
  { label: 'Concise', value: AgentReplyStyle.CONCISE },
  { label: 'Detailed', value: AgentReplyStyle.DETAILED },
  { label: 'Friendly', value: AgentReplyStyle.FRIENDLY },
  { label: 'Professional', value: AgentReplyStyle.PROFESSIONAL },
];

function resolveReplyStyle(raw?: string | null): AgentReplyStyle {
  if (!raw) {
    return AgentReplyStyle.CONCISE;
  }

  const normalized = raw.trim().toUpperCase();
  const match = REPLY_STYLE_OPTIONS.find(
    (option) => option.value === normalized,
  );
  return match?.value ?? AgentReplyStyle.CONCISE;
}

export default function SettingsOrganizationPolicyPage() {
  const { settings, updateSettings } = useOrganization();
  const [isSavingReplyStyle, setIsSavingReplyStyle] = useState(false);
  const replyStyle = resolveReplyStyle(settings?.agentReplyStyle);

  const handleReplyStyleChange = useCallback(
    async (value: string) => {
      setIsSavingReplyStyle(true);
      try {
        await updateSettings('agentReplyStyle', resolveReplyStyle(value));
      } catch (error) {
        logger.error('Failed to update organization reply style', error);
      } finally {
        setIsSavingReplyStyle(false);
      }
    },
    [updateSettings],
  );

  return (
    <div className="space-y-4">
      <Card
        label="Assistant Reply Style"
        description="Controls the default style the assistant uses across the workspace. Personal chat defaults and brand voice are configured elsewhere."
        bodyClassName="gap-3 p-4"
      >
        <div>
          <p className="text-sm font-medium">Organization Default</p>
          <Select
            value={replyStyle}
            disabled={isSavingReplyStyle}
            onValueChange={handleReplyStyleChange}
          >
            <SelectTrigger className="w-full mt-2 rounded">
              <SelectValue placeholder="Select a reply style" />
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
      </Card>

      <SettingsAgentsPage />
    </div>
  );
}
