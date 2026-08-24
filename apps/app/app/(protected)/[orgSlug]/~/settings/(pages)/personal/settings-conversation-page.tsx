'use client';

import { PERSONAL_SETTINGS_ANCHOR } from '@app-config/personal-settings-anchor';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import {
  AGENT_CHAT_CAPABILITY,
  isRetiredAgentChatModel,
} from '@genfeedai/constants';
import {
  AgentReplyStyle,
  fromRouterPriority,
  GenerationPriority,
  ModelCategory,
  ModelProvider,
  RouterPriority,
  toRouterPriority,
} from '@genfeedai/enums';
import type { IModel, ISetting } from '@genfeedai/interfaces';
import { resolveOrgAllowlistedModels } from '@helpers/model-allowlist.helper';
import { useAuthUser } from '@hooks/auth/use-auth-user/use-auth-user';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { User } from '@models/auth/user.model';
import { ModelsService } from '@services/ai/models.service';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import Card from '@ui/card/Card';
import ModelSelectorPopover from '@ui/dropdowns/model-selector/ModelSelectorPopover';
import {
  AUTO_MODEL_OPTION_VALUE,
  getAutoModelLabel,
} from '@ui/dropdowns/model-selector/model-selector.constants';
import { useModelFavorites } from '@ui/dropdowns/model-selector/useModelFavorites';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives';
import { Button } from '@ui/primitives/button';
import { useCallback, useEffect, useMemo, useState } from 'react';

const REPLY_STYLE_OPTIONS: Array<{ label: string; value: AgentReplyStyle }> = [
  { label: 'Concise', value: AgentReplyStyle.CONCISE },
  { label: 'Detailed', value: AgentReplyStyle.DETAILED },
  { label: 'Friendly', value: AgentReplyStyle.FRIENDLY },
  { label: 'Professional', value: AgentReplyStyle.PROFESSIONAL },
];
const GENERATION_PRIORITY_OPTIONS: Array<{
  description: string;
  label: string;
  value: GenerationPriority;
}> = [
  {
    description: 'Use the strongest models where possible.',
    label: 'Best Quality',
    value: GenerationPriority.QUALITY,
  },
  {
    description: 'Balance quality, latency, and spend.',
    label: 'Balanced',
    value: GenerationPriority.BALANCED,
  },
  {
    description: 'Prefer faster models for interactive chat.',
    label: 'Fast',
    value: GenerationPriority.SPEED,
  },
  {
    description: 'Bias toward cheaper models to save credits.',
    label: 'Budget',
    value: GenerationPriority.COST,
  },
];

interface SettingsConversationPageProps {
  showReplyStyle?: boolean;
}

function isAgentChatRegistryModel(model: IModel): boolean {
  if (model.category !== ModelCategory.TEXT) {
    return false;
  }
  // Keep inactive and fully retired keys out. Legacy/active-but-deprecated
  // rows still load so the picker can offer a Legacy filter, matching the
  // prompt-bar catalogue.
  if (model.isActive === false) {
    return false;
  }
  if (isRetiredAgentChatModel(model.key)) {
    return false;
  }

  const capabilities = model.capabilities ?? [];
  const recommended = model.recommendedFor ?? [];

  return (
    capabilities.includes(AGENT_CHAT_CAPABILITY) ||
    recommended.includes(AGENT_CHAT_CAPABILITY) ||
    model.provider === ModelProvider.OPENROUTER ||
    model.isLegacy === true
  );
}

export default function SettingsConversationPage({
  showReplyStyle = true,
}: SettingsConversationPageProps) {
  const { isLoaded } = useAuthUser();
  const { currentUser, mutateUser } = useCurrentUser();
  const { refresh, settings, updateSettings } = useOrganization();
  const { organizationId, settingsLoading } = useBrand();
  const [generationPriority, setGenerationPriority] =
    useState<GenerationPriority>(GenerationPriority.BALANCED);
  const [defaultAgentModel, setDefaultAgentModel] = useState('');
  const [isSavingConversation, setIsSavingConversation] = useState(false);
  const [isSavingReplyStyle, setIsSavingReplyStyle] = useState(false);
  const [registryModels, setRegistryModels] = useState<IModel[]>([]);
  const [isModelsLoading, setIsModelsLoading] = useState(true);
  const { favoriteModelKeys, onFavoriteToggle } = useModelFavorites();

  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );
  const getModelsService = useAuthedService((token: string) =>
    ModelsService.getInstance(token),
  );

  useEffect(() => {
    setGenerationPriority(
      currentUser?.settings?.generationPriority ?? GenerationPriority.BALANCED,
    );
    setDefaultAgentModel(currentUser?.settings?.defaultAgentModel ?? '');
  }, [
    currentUser?.settings?.defaultAgentModel,
    currentUser?.settings?.generationPriority,
  ]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      setIsModelsLoading(true);
      try {
        const service = await getModelsService();
        const rows = await service.findAll(
          {
            category: ModelCategory.TEXT,
            isActive: true,
            limit: 100,
            sort: 'label: 1',
          },
          controller.signal,
        );
        if (cancelled) {
          return;
        }
        setRegistryModels(rows.filter(isAgentChatRegistryModel));
      } catch (error) {
        if (!cancelled) {
          logger.error('Failed to load chat models for settings', error);
          setRegistryModels([]);
        }
      } finally {
        if (!cancelled) {
          setIsModelsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [getModelsService]);

  const handleReplyStyleChange = useCallback(
    async (value: string) => {
      setIsSavingReplyStyle(true);
      try {
        const normalized = value.trim().toUpperCase();
        const resolved = Object.values(AgentReplyStyle).includes(
          normalized as AgentReplyStyle,
        )
          ? (normalized as AgentReplyStyle)
          : AgentReplyStyle.CONCISE;
        await updateSettings('agentReplyStyle', resolved);
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
        // Empty string is the persisted Auto sentinel. `undefined` would omit
        // the field and leave a removed or stale model override in place.
        defaultAgentModel,
        generationPriority,
      };

      await service.patchSettings(currentUser.id, patch);
      mutateUser(
        new User({
          ...currentUser,
          settings: {
            ...currentUser.settings,
            ...patch,
            // Persist empty string so Auto is explicit after save.
            defaultAgentModel: defaultAgentModel || '',
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

  const routerPriority =
    toRouterPriority(generationPriority) ?? RouterPriority.BALANCED;
  const isAutoSelected = !defaultAgentModel.trim();
  const pickerValues = useMemo(
    () =>
      isAutoSelected
        ? [AUTO_MODEL_OPTION_VALUE]
        : defaultAgentModel
          ? [defaultAgentModel]
          : [],
    [defaultAgentModel, isAutoSelected],
  );

  const pickerModels = useMemo(
    () =>
      resolveOrgAllowlistedModels(registryModels, {
        enabledModelIds: settings?.enabledModelIds,
        isSettingsReady: !settingsLoading,
        organizationId,
      }),
    [
      organizationId,
      registryModels,
      settings?.enabledModelIds,
      settingsLoading,
    ],
  );

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-form">
        <span className="animate-spin size-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showReplyStyle && (
        <Card
          label="Conversation Preferences"
          description="Controls how the interactive assistant talks to users in chat. Brand persona and autonomous agent behavior now live in brand settings and agent policy."
          bodyClassName="gap-3 p-4"
        >
          <div>
            <p className="text-sm font-medium">Reply Style</p>
            <Select
              value={
                Object.values(AgentReplyStyle).includes(
                  (settings?.agentReplyStyle?.toUpperCase() ??
                    '') as AgentReplyStyle,
                )
                  ? (settings?.agentReplyStyle?.toUpperCase() as AgentReplyStyle)
                  : AgentReplyStyle.CONCISE
              }
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
      )}

      <Card
        id={PERSONAL_SETTINGS_ANCHOR.CHAT_DEFAULTS}
        label="Chat Defaults"
        bodyClassName="gap-3 p-4"
      >
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Default chat model</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Auto routes by generation priority. Pick a model to pin every new
              chat.
            </p>
            <div className="mt-2">
              <ModelSelectorPopover
                autoLabel={getAutoModelLabel(routerPriority)}
                className="w-full max-w-md justify-start border border-border bg-background"
                favoriteModelKeys={favoriteModelKeys}
                isDisabled={isSavingConversation || isModelsLoading}
                models={pickerModels}
                name="default-agent-model"
                onChange={(_name, values) => {
                  const next = values[0]?.trim() ?? '';
                  if (!next || next === AUTO_MODEL_OPTION_VALUE) {
                    setDefaultAgentModel('');
                    return;
                  }
                  setDefaultAgentModel(next);
                }}
                onFavoriteToggle={onFavoriteToggle}
                onPrioritizeChange={(priority) => {
                  setGenerationPriority(fromRouterPriority(priority));
                  setDefaultAgentModel('');
                }}
                prioritize={routerPriority}
                selectionMode="single"
                values={pickerValues}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {
                GENERATION_PRIORITY_OPTIONS.find(
                  (option) => option.value === generationPriority,
                )?.description
              }
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
