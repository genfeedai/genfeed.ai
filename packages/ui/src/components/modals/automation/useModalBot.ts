import {
  type BotSchema,
  botSchema,
  type EngagementBotSettingsSchema,
  type MonitoringBotSettingsSchema,
  type PublishingBotSettingsSchema,
} from '@genfeedai/client/schemas';
import {
  AlertFrequency,
  BotCategory,
  type BotPlatform,
  ContentSourceType,
  EngagementAction,
  ModalEnum,
  MonitoringAlertType,
  Platform,
  PublishingFrequency,
} from '@genfeedai/enums';
import { useCrudModal } from '@genfeedai/hooks/ui/use-crud-modal/use-crud-modal';
import type { IBot } from '@genfeedai/interfaces';
import type { ModalBotProps } from '@genfeedai/props/modals/modal.props';
import { BotsService } from '@genfeedai/services/automation/bots.service';
import { type ChangeEvent, useEffect, useMemo } from 'react';
import { FaTwitch, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import {
  HiBell,
  HiChatBubbleLeftRight,
  HiHeart,
  HiMegaphone,
} from 'react-icons/hi2';

export const BOT_PLATFORMS_LIST = [
  {
    color: 'text-blue-400',
    icon: FaXTwitter,
    label: 'X (Twitter)',
    platform: Platform.TWITTER,
  },
  {
    color: 'text-red-500',
    icon: FaYoutube,
    label: 'YouTube',
    platform: Platform.YOUTUBE,
  },
  {
    color: 'text-purple-500',
    icon: FaTwitch,
    label: 'Twitch',
    platform: Platform.TWITCH,
  },
] as const;

export const BOT_CATEGORIES = [
  {
    description: 'Respond to chat messages',
    icon: HiChatBubbleLeftRight,
    label: 'Chat Bot',
    value: BotCategory.CHAT,
  },
  {
    description: 'Auto-reply to comments',
    icon: HiChatBubbleLeftRight,
    label: 'Comment Bot',
    value: BotCategory.COMMENT,
  },
  {
    description: 'Auto-like, follow, and engage',
    icon: HiHeart,
    label: 'Engagement Bot',
    value: BotCategory.ENGAGEMENT,
  },
  {
    description: 'Alert on keywords',
    icon: HiBell,
    label: 'Monitoring Bot',
    value: BotCategory.MONITORING,
  },
  {
    description: 'Automated content publishing',
    icon: HiMegaphone,
    label: 'Publishing Bot',
    value: BotCategory.PUBLISHING,
  },
] as const;

export const DEFAULT_ENGAGEMENT_SETTINGS: EngagementBotSettingsSchema = {
  actions: [EngagementAction.LIKE],
  actionsPerDay: 100,
  actionsPerHour: 10,
  delayBetweenActions: 30,
  excludeAccounts: [],
  onlyVerified: false,
  targetAccounts: [],
  targetHashtags: [],
  targetKeywords: [],
};

export const DEFAULT_MONITORING_SETTINGS: MonitoringBotSettingsSchema = {
  alertFrequency: AlertFrequency.INSTANT,
  alertTypes: [MonitoringAlertType.IN_APP],
  excludeKeywords: [],
  hashtags: [],
  // Seeded empty on purpose: `keywords` is required (schema enforces min(1)),
  // so an empty seed surfaces the validation error and forces the user to add a
  // real keyword, mirroring how `label` is seeded ''. Seeding [''] would smuggle
  // an empty-string keyword past the length check and persist as junk data.
  keywords: [],
  mentionAccounts: [],
  onlyVerified: false,
};

export const DEFAULT_PUBLISHING_SETTINGS: PublishingBotSettingsSchema = {
  autoHashtags: [],
  contentSourceType: ContentSourceType.QUEUE,
  daysOfWeek: [1, 2, 3, 4, 5],
  frequency: PublishingFrequency.DAILY,
  maxPostsPerDay: 5,
  scheduledTimes: ['09:00', '12:00', '18:00'],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

const SETTINGS_DEFAULTS = {
  engagementSettings: DEFAULT_ENGAGEMENT_SETTINGS,
  monitoringSettings: DEFAULT_MONITORING_SETTINGS,
  publishingSettings: DEFAULT_PUBLISHING_SETTINGS,
} as const;

export function useModalBot({ bot, onConfirm }: ModalBotProps) {
  const {
    form,
    formRef,
    isSubmitting,
    onSubmit,
    closeModal,
    handleDelete: deleteModalBot,
  } = useCrudModal<IBot, BotSchema>({
    defaultValues: {
      category: BotCategory.CHAT,
      description: '',
      label: '',
      platforms: [],
      settings: {
        messagesPerMinute: 5,
        responseDelaySeconds: 10,
        responses: [],
        triggers: [],
      },
    },
    entity: bot || null,
    modalId: ModalEnum.BOT,
    onConfirm,
    schema: botSchema,
    serviceFactory: (token) => BotsService.getInstance(token),
  });

  // Populate form when editing
  useEffect(() => {
    if (bot) {
      form.setValue('label', bot.label ?? '');
      form.setValue('description', bot.description ?? '');
      form.setValue(
        'category',
        bot.category === BotCategory.LIVESTREAM_CHAT
          ? BotCategory.CHAT
          : (bot.category ?? BotCategory.CHAT),
      );
      form.setValue('platforms', bot.platforms ?? []);
      form.setValue('settings', bot.settings);

      // Merge persisted settings over schema defaults so optional interface
      // fields are backfilled to the values the validated schema requires.
      if (bot.engagementSettings) {
        form.setValue('engagementSettings', {
          ...DEFAULT_ENGAGEMENT_SETTINGS,
          ...bot.engagementSettings,
        });
      }
      if (bot.monitoringSettings) {
        form.setValue('monitoringSettings', {
          ...DEFAULT_MONITORING_SETTINGS,
          ...bot.monitoringSettings,
        });
      }
      if (bot.publishingSettings) {
        form.setValue('publishingSettings', {
          ...DEFAULT_PUBLISHING_SETTINGS,
          ...bot.publishingSettings,
        });
      }
    }
  }, [bot, form]);

  const processKeyDownModalBot = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!isSubmitting && form.formState.isValid) {
        onSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
      }
    }
  };

  const updateModalBot = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    form.setValue(name as keyof BotSchema, value, { shouldValidate: true });
  };

  const handleCategoryChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const category = e.target.value as BotCategory;
    form.setValue('category', category, { shouldValidate: true });

    // Initialize category-specific settings the first time that category is
    // selected, so the validated schema fields start from sensible defaults.
    if (
      category === BotCategory.ENGAGEMENT &&
      !form.getValues('engagementSettings')
    ) {
      form.setValue('engagementSettings', DEFAULT_ENGAGEMENT_SETTINGS);
    }
    if (
      category === BotCategory.MONITORING &&
      !form.getValues('monitoringSettings')
    ) {
      form.setValue('monitoringSettings', DEFAULT_MONITORING_SETTINGS);
    }
    if (
      category === BotCategory.PUBLISHING &&
      !form.getValues('publishingSettings')
    ) {
      form.setValue('publishingSettings', DEFAULT_PUBLISHING_SETTINGS);
    }
  };

  const handlePlatformToggle = (platform: BotPlatform) => {
    const currentPlatforms = form.getValues('platforms') || [];
    const newPlatforms = currentPlatforms.includes(platform)
      ? currentPlatforms.filter((p) => p !== platform)
      : [...currentPlatforms, platform];
    form.setValue('platforms', newPlatforms, { shouldValidate: true });
  };

  const handleSettingChange = (field: string, value: unknown) => {
    const currentSettings = form.getValues('settings');
    form.setValue(
      'settings',
      { ...currentSettings, [field]: value },
      { shouldValidate: true },
    );
  };

  const handleCategorySettingChange = <
    K extends keyof typeof SETTINGS_DEFAULTS,
  >(
    settingsKey: K,
    field: string,
    value: unknown,
  ) => {
    const currentSettings =
      form.getValues(settingsKey) ?? SETTINGS_DEFAULTS[settingsKey];
    // The merged object carries a computed key, so assert it back to the
    // concrete settings type for the resolved form field.
    const next = { ...currentSettings, [field]: value };
    if (settingsKey === 'engagementSettings') {
      form.setValue('engagementSettings', next as EngagementBotSettingsSchema, {
        shouldValidate: true,
      });
    } else if (settingsKey === 'monitoringSettings') {
      form.setValue('monitoringSettings', next as MonitoringBotSettingsSchema, {
        shouldValidate: true,
      });
    } else if (settingsKey === 'publishingSettings') {
      form.setValue('publishingSettings', next as PublishingBotSettingsSchema, {
        shouldValidate: true,
      });
    } else {
      // Exhaustiveness guard: every settings key is handled above.
      const _exhaustive: never = settingsKey;
      return _exhaustive;
    }
  };

  const handleArrayToggle = <T>(
    settingsKey: keyof typeof SETTINGS_DEFAULTS,
    field: string,
    item: T,
    defaultSettings: { [key: string]: T[] },
  ) => {
    const currentSettings =
      form.getValues(settingsKey) ?? SETTINGS_DEFAULTS[settingsKey];
    const currentItems =
      (currentSettings as unknown as { [key: string]: T[] })[field] ||
      defaultSettings[field] ||
      [];
    const newItems = currentItems.includes(item)
      ? currentItems.filter((i) => i !== item)
      : [...currentItems, item];
    handleCategorySettingChange(settingsKey, field, newItems);
  };

  const parseCommaSeparated = (value: string, stripPrefix?: string) =>
    value.split(',').flatMap((t) => {
      const trimmed = stripPrefix
        ? t.trim().replace(new RegExp(`^${stripPrefix}`), '')
        : t.trim();
      return trimmed ? [trimmed] : [];
    });

  const platforms = form.watch('platforms') || [];
  const category = form.watch('category') || BotCategory.CHAT;
  const settings = form.watch('settings') || {
    messagesPerMinute: 5,
    responseDelaySeconds: 10,
    responses: [],
    triggers: [],
  };
  const engagementSettings =
    form.watch('engagementSettings') || DEFAULT_ENGAGEMENT_SETTINGS;
  const monitoringSettings =
    form.watch('monitoringSettings') || DEFAULT_MONITORING_SETTINGS;
  const publishingSettings =
    form.watch('publishingSettings') || DEFAULT_PUBLISHING_SETTINGS;

  const selectedCategory = useMemo(
    () => BOT_CATEGORIES.find((c) => c.value === category),
    [category],
  );

  const showChatCommentSettings =
    category === BotCategory.CHAT || category === BotCategory.COMMENT;
  const showEngagementSettings = category === BotCategory.ENGAGEMENT;
  const showMonitoringSettings = category === BotCategory.MONITORING;
  const showPublishingSettings = category === BotCategory.PUBLISHING;

  return {
    form,
    formRef,
    isSubmitting,
    onSubmit,
    closeModal,
    deleteModalBot,
    processKeyDownModalBot,
    updateModalBot,
    handleCategoryChange,
    handlePlatformToggle,
    handleSettingChange,
    handleCategorySettingChange,
    handleArrayToggle,
    parseCommaSeparated,
    platforms,
    category,
    settings,
    engagementSettings,
    monitoringSettings,
    publishingSettings,
    selectedCategory,
    showChatCommentSettings,
    showEngagementSettings,
    showMonitoringSettings,
    showPublishingSettings,
  };
}
