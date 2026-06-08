import { type BotSchema, botSchema } from '@genfeedai/client/schemas';
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
import type {
  IBot,
  IEngagementBotSettings,
  IMonitoringBotSettings,
  IPublishingBotSettings,
} from '@genfeedai/interfaces';
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

export const DEFAULT_ENGAGEMENT_SETTINGS: IEngagementBotSettings = {
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

export const DEFAULT_MONITORING_SETTINGS: IMonitoringBotSettings = {
  alertFrequency: AlertFrequency.INSTANT,
  alertTypes: [MonitoringAlertType.IN_APP],
  excludeKeywords: [],
  hashtags: [],
  keywords: [],
  mentionAccounts: [],
  onlyVerified: false,
};

export const DEFAULT_PUBLISHING_SETTINGS: IPublishingBotSettings = {
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

      // Extended settings fields - use type assertion for form that doesn't include these in schema yet
      // TODO: Update BotSchema in @genfeedai/client to include these fields
      if (bot.engagementSettings) {
        (form as { setValue: (key: string, value: unknown) => void }).setValue(
          'engagementSettings',
          bot.engagementSettings,
        );
      }
      if (bot.monitoringSettings) {
        (form as { setValue: (key: string, value: unknown) => void }).setValue(
          'monitoringSettings',
          bot.monitoringSettings,
        );
      }
      if (bot.publishingSettings) {
        (form as { setValue: (key: string, value: unknown) => void }).setValue(
          'publishingSettings',
          bot.publishingSettings,
        );
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
    // Cast to bypass schema type constraints for extended categories
    // TODO: Update BotSchema to include extended categories
    (
      form as {
        setValue: (key: string, value: unknown, options?: object) => void;
      }
    ).setValue('category', category, { shouldValidate: true });

    // Initialize category-specific settings when switching
    // Use type assertions for form methods with extended fields
    // TODO: Update BotSchema to include extended categories and settings
    const formExt = form as unknown as {
      setValue: (key: string, value: unknown) => void;
      getValues: (key: string) => unknown;
    };
    if (
      category === BotCategory.ENGAGEMENT &&
      !formExt.getValues('engagementSettings')
    ) {
      formExt.setValue('engagementSettings', DEFAULT_ENGAGEMENT_SETTINGS);
    }
    if (
      category === BotCategory.MONITORING &&
      !formExt.getValues('monitoringSettings')
    ) {
      formExt.setValue('monitoringSettings', DEFAULT_MONITORING_SETTINGS);
    }
    if (
      category === BotCategory.PUBLISHING &&
      !formExt.getValues('publishingSettings')
    ) {
      formExt.setValue('publishingSettings', DEFAULT_PUBLISHING_SETTINGS);
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

  // Type-safe wrapper for extended form fields not in schema
  // TODO: Update BotSchema in @genfeedai/client to include these fields
  const formExtended = form as unknown as {
    getValues: (key: string) => unknown;
    setValue: (key: string, value: unknown, options?: object) => void;
    watch: (key: string) => unknown;
  };

  const handleCategorySettingChange = <
    K extends keyof typeof SETTINGS_DEFAULTS,
  >(
    settingsKey: K,
    field: string,
    value: unknown,
  ) => {
    const currentSettings =
      (formExtended.getValues(settingsKey) as (typeof SETTINGS_DEFAULTS)[K]) ||
      SETTINGS_DEFAULTS[settingsKey];
    formExtended.setValue(
      settingsKey,
      { ...currentSettings, [field]: value },
      { shouldValidate: true },
    );
  };

  const handleArrayToggle = <T>(
    settingsKey: keyof typeof SETTINGS_DEFAULTS,
    field: string,
    item: T,
    defaultSettings: { [key: string]: T[] },
  ) => {
    const currentSettings =
      (formExtended.getValues(
        settingsKey,
      ) as (typeof SETTINGS_DEFAULTS)[typeof settingsKey]) ||
      SETTINGS_DEFAULTS[settingsKey];
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
  // Cast to extended BotCategory type since schema only has 'chat' | 'comment'
  const category =
    (formExtended.watch('category') as BotCategory) || BotCategory.CHAT;
  const settings = form.watch('settings') || {
    messagesPerMinute: 5,
    responseDelaySeconds: 10,
    responses: [],
    triggers: [],
  };
  const engagementSettings =
    (formExtended.watch('engagementSettings') as IEngagementBotSettings) ||
    DEFAULT_ENGAGEMENT_SETTINGS;
  const monitoringSettings =
    (formExtended.watch('monitoringSettings') as IMonitoringBotSettings) ||
    DEFAULT_MONITORING_SETTINGS;
  const publishingSettings =
    (formExtended.watch('publishingSettings') as IPublishingBotSettings) ||
    DEFAULT_PUBLISHING_SETTINGS;

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
