'use client';

import { useUser } from '@clerk/nextjs';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { AgentReplyStyle } from '@genfeedai/enums';
import type { ISetting } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { User } from '@models/auth/user.model';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives';
import { useCallback, useEffect, useState } from 'react';

const AUTO_MODEL_SELECT_VALUE = '__auto__';
const REPLY_STYLE_OPTIONS: Array<{ label: string; value: AgentReplyStyle }> = [
  { label: 'Concise', value: AgentReplyStyle.CONCISE },
  { label: 'Detailed', value: AgentReplyStyle.DETAILED },
  { label: 'Friendly', value: AgentReplyStyle.FRIENDLY },
  { label: 'Professional', value: AgentReplyStyle.PROFESSIONAL },
];
const GENERATION_PRIORITY_OPTIONS: Array<{
  description: string;
  label: string;
  value: NonNullable<ISetting['generationPriority']>;
}> = [
  {
    description: 'Use the strongest models where possible.',
    label: 'Best Quality',
    value: 'quality',
  },
  {
    description: 'Balance quality, latency, and spend.',
    label: 'Balanced',
    value: 'balanced',
  },
  {
    description: 'Prefer faster models for interactive chat.',
    label: 'Fast',
    value: 'speed',
  },
  {
    description: 'Bias toward cheaper models to save credits.',
    label: 'Budget',
    value: 'cost',
  },
];

interface SettingsConversationPageProps {
  showReplyStyle?: boolean;
}

export default function SettingsConversationPage({
  showReplyStyle = true,
}: SettingsConversationPageProps) {
  const { isLoaded } = useUser();
  const { currentUser, mutateUser } = useCurrentUser();
  const { refresh, settings, updateSettings } = useOrganization();
  const [generationPriority, setGenerationPriority] =
    useState<NonNullable<ISetting['generationPriority']>>('balanced');
  const [defaultAgentModel, setDefaultAgentModel] = useState('');
  const [isSavingConversation, setIsSavingConversation] = useState(false);
  const [isSavingReplyStyle, setIsSavingReplyStyle] = useState(false);

  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  useEffect(() => {
    setGenerationPriority(
      currentUser?.settings?.generationPriority ?? 'balanced',
    );
    setDefaultAgentModel(currentUser?.settings?.defaultAgentModel ?? '');
  }, [
    currentUser?.settings?.defaultAgentModel,
    currentUser?.settings?.generationPriority,
  ]);

  const handleReplyStyleChange = useCallback(
    async (value: string) => {
      setIsSavingReplyStyle(true);
      try {
        await updateSettings('agentReplyStyle', value as AgentReplyStyle);
      } catch (error) {
        logger.error('Failed to update conversation reply style', error);
      } finally {
        setIsSavingReplyStyle(false);
      }
    },
    [updateSettings],
  );

  const handleConversationSave = useCallback(async () => {
    if (!currentUser) {
      return;
    }

    setIsSavingConversation(true);
    try {
      const service = await getUsersService();
      const patch: Partial<ISetting> = {
        defaultAgentModel: defaultAgentModel || undefined,
        generationPriority,
      };

      await service.patchSettings(currentUser.id, patch);
      mutateUser(
        new User({
          ...currentUser,
          settings: {
            ...currentUser.settings,
            ...patch,
          },
        }),
      );
      await refresh();
    } catch (error) {
      logger.error('Failed to update conversation settings', error);
    } finally {
      setIsSavingConversation(false);
    }
  }, [
    currentUser,
    defaultAgentModel,
    generationPriority,
    getUsersService,
    mutateUser,
    refresh,
  ]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-form">
        <span className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const enabledModels = settings?.enabledModels ?? [];
  const selectedModel = defaultAgentModel || AUTO_MODEL_SELECT_VALUE;

  return (
    <div className="space-y-6">
      {showReplyStyle && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">
            Conversation Preferences
          </h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium">Reply Style</p>
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
              Controls how the interactive assistant talks to users in chat.
              Brand persona and autonomous agent behavior now live in brand
              settings and agent policy.
            </p>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Chat Defaults</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">Generation Priority</p>
            <Select
              value={generationPriority}
              disabled={isSavingConversation}
              onValueChange={(value) =>
                setGenerationPriority(
                  value as NonNullable<ISetting['generationPriority']>,
                )
              }
            >
              <SelectTrigger className="w-full mt-2 rounded">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GENERATION_PRIORITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">
              {
                GENERATION_PRIORITY_OPTIONS.find(
                  (option) => option.value === generationPriority,
                )?.description
              }
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Chat Model Override</p>
            <Select
              value={selectedModel}
              disabled={isSavingConversation}
              onValueChange={(value) =>
                setDefaultAgentModel(
                  value === AUTO_MODEL_SELECT_VALUE ? '' : value,
                )
              }
            >
              <SelectTrigger className="w-full mt-2 rounded">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO_MODEL_SELECT_VALUE}>
                  OpenRouter Auto (default)
                </SelectItem>
                {enabledModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">
              Leave this on OpenRouter Auto unless you need to pin a specific
              model for chat.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              label="Save Conversation Settings"
              onClick={handleConversationSave}
              isLoading={isSavingConversation}
              isDisabled={isSavingConversation}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
