import { type BotSchema, botSchema } from '@genfeedai/client/schemas';
import {
  AlertCategory,
  AlertFrequency,
  BotCategory,
  type BotPlatform,
  ButtonVariant,
  ContentSourceType,
  EngagementAction,
  ModalEnum,
  MonitoringAlertType,
  Platform,
  PublishingFrequency,
} from '@genfeedai/enums';
import type {
  IBot,
  IEngagementBotSettings,
  IMonitoringBotSettings,
  IPublishingBotSettings,
} from '@genfeedai/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { useCrudModal } from '@hooks/ui/use-crud-modal/use-crud-modal';
import type { ModalBotProps } from '@props/modals/modal.props';
import { BotsService } from '@services/automation/bots.service';
import Button from '@ui/buttons/base/Button';
import Alert from '@ui/feedback/alert/Alert';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import FormTextarea from '@ui/forms/inputs/textarea/form-textarea/FormTextarea';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { type ChangeEvent, useEffect, useMemo } from 'react';
import { FaTwitch, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import {
  HiBell,
  HiChatBubbleLeftRight,
  HiHeart,
  HiMegaphone,
  HiTrash,
} from 'react-icons/hi2';

const BOT_PLATFORMS = [
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

const BOT_CATEGORIES = [
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

const ENGAGEMENT_ACTIONS = [
  { label: 'Like', value: EngagementAction.LIKE },
  { label: 'Follow', value: EngagementAction.FOLLOW },
  { label: 'Retweet', value: EngagementAction.RETWEET },
  { label: 'Bookmark', value: EngagementAction.BOOKMARK },
] as const;

const ALERT_TYPES = [
  { label: 'In-App', value: MonitoringAlertType.IN_APP },
  { label: 'Email', value: MonitoringAlertType.EMAIL },
  { label: 'Webhook', value: MonitoringAlertType.WEBHOOK },
  { label: 'Slack', value: MonitoringAlertType.SLACK },
] as const;

const PUBLISHING_FREQUENCIES = [
  { label: 'Hourly', value: PublishingFrequency.HOURLY },
  { label: 'Daily', value: PublishingFrequency.DAILY },
  { label: 'Weekly', value: PublishingFrequency.WEEKLY },
  { label: 'Custom Schedule', value: PublishingFrequency.CUSTOM },
] as const;

const DEFAULT_ENGAGEMENT_SETTINGS: IEngagementBotSettings = {
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

const DEFAULT_MONITORING_SETTINGS: IMonitoringBotSettings = {
  alertFrequency: AlertFrequency.INSTANT,
  alertTypes: [MonitoringAlertType.IN_APP],
  excludeKeywords: [],
  hashtags: [],
  keywords: [],
  mentionAccounts: [],
  onlyVerified: false,
};

const DEFAULT_PUBLISHING_SETTINGS: IPublishingBotSettings = {
  autoHashtags: [],
  contentSourceType: ContentSourceType.QUEUE,
  daysOfWeek: [1, 2, 3, 4, 5],
  frequency: PublishingFrequency.DAILY,
  maxPostsPerDay: 5,
  scheduledTimes: ['09:00', '12:00', '18:00'],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export default function ModalBot({ bot, onConfirm }: ModalBotProps) {
  const { form, formRef, isSubmitting, onSubmit, closeModal, handleDelete } =
    useCrudModal<IBot, BotSchema>({
      defaultValues: {
        category: 'chat',
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!isSubmitting && form.formState.isValid) {
        onSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
      }
    }
  };

  const handleChange = (
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

  const settingsDefaults = {
    engagementSettings: DEFAULT_ENGAGEMENT_SETTINGS,
    monitoringSettings: DEFAULT_MONITORING_SETTINGS,
    publishingSettings: DEFAULT_PUBLISHING_SETTINGS,
  } as const;

  // Type-safe wrapper for extended form fields not in schema
  // TODO: Update BotSchema in @genfeedai/client to include these fields
  const formExtended = form as unknown as {
    getValues: (key: string) => unknown;
    setValue: (key: string, value: unknown, options?: object) => void;
    watch: (key: string) => unknown;
  };

  const handleCategorySettingChange = <K extends keyof typeof settingsDefaults>(
    settingsKey: K,
    field: string,
    value: unknown,
  ) => {
    const currentSettings =
      (formExtended.getValues(settingsKey) as (typeof settingsDefaults)[K]) ||
      settingsDefaults[settingsKey];
    formExtended.setValue(
      settingsKey,
      { ...currentSettings, [field]: value },
      { shouldValidate: true },
    );
  };

  const handleArrayToggle = <T,>(
    settingsKey: keyof typeof settingsDefaults,
    field: string,
    item: T,
    defaultSettings: { [key: string]: T[] },
  ) => {
    const currentSettings =
      (formExtended.getValues(
        settingsKey,
      ) as (typeof settingsDefaults)[typeof settingsKey]) ||
      settingsDefaults[settingsKey];
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
    value
      .split(',')
      .map((t) =>
        stripPrefix
          ? t.trim().replace(new RegExp(`^${stripPrefix}`), '')
          : t.trim(),
      )
      .filter((t) => t);

  const platforms = form.watch('platforms') || [];
  // Cast to extended BotCategory type since schema only has 'chat' | 'comment'
  const category = (formExtended.watch('category') as BotCategory) || 'chat';
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

  return (
    <Modal id={ModalEnum.BOT} title={bot ? 'Edit Bot' : 'Create Bot'}>
      <form ref={formRef} onSubmit={onSubmit}>
        {hasFormErrors(form.formState.errors) && (
          <Alert type={AlertCategory.ERROR} className="mb-4">
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {/* Basic Information */}
          <div className="space-y-4">
            <FormControl label="Bot Name">
              <FormInput
                type="text"
                name="label"
                control={form.control}
                onChange={handleChange}
                placeholder="Enter bot name"
                isRequired={true}
                isDisabled={isSubmitting}
              />
            </FormControl>

            <FormControl label="Description">
              <FormTextarea
                name="description"
                control={form.control}
                onChange={handleChange}
                placeholder="Enter description (optional)"
                isDisabled={isSubmitting}
                onKeyDown={handleKeyDown}
              />
            </FormControl>

            <FormControl label="Bot Type">
              <Select
                value={category}
                onValueChange={(value) => {
                  handleCategoryChange({
                    target: { value },
                  } as ChangeEvent<HTMLSelectElement>);
                }}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOT_CATEGORIES.map(({ value, label, description }) => (
                    <SelectItem key={value} value={value}>
                      {label} - {description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>

            {selectedCategory && (
              <div className="bg-background p-3 flex items-center gap-3">
                <selectedCategory.icon className="text-2xl text-primary" />
                <div>
                  <div className="font-medium">{selectedCategory.label}</div>
                  <div className="text-sm text-foreground/60">
                    {selectedCategory.description}
                  </div>
                </div>
              </div>
            )}

            <FormControl label="Platforms">
              <div className="flex flex-wrap gap-4">
                {BOT_PLATFORMS.map(({ platform, icon: Icon, color, label }) => (
                  <label
                    key={platform}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 border-input accent-primary"
                      checked={platforms.includes(platform)}
                      onChange={() => handlePlatformToggle(platform)}
                      disabled={isSubmitting}
                    />
                    <Icon className={color} />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </FormControl>
          </div>

          <div className="h-px bg-border my-4" />

          {/* Chat/Comment Bot Settings */}
          {showChatCommentSettings && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Chat Settings</h3>

              <FormControl label="Messages Per Minute">
                <Input
                  type="number"
                  value={settings.messagesPerMinute}
                  onChange={(e) =>
                    handleSettingChange(
                      'messagesPerMinute',
                      parseInt(e.target.value, 10),
                    )
                  }
                  min={1}
                  max={60}
                  disabled={isSubmitting}
                />
              </FormControl>

              <FormControl label="Response Delay (seconds)">
                <Input
                  type="number"
                  value={settings.responseDelaySeconds}
                  onChange={(e) =>
                    handleSettingChange(
                      'responseDelaySeconds',
                      parseInt(e.target.value, 10),
                    )
                  }
                  min={0}
                  max={300}
                  disabled={isSubmitting}
                />
              </FormControl>

              <FormControl label="Trigger Words (comma separated)">
                <FormTextarea
                  name="triggers"
                  value={(settings.triggers || []).join(', ')}
                  onChange={(e) =>
                    handleSettingChange(
                      'triggers',
                      parseCommaSeparated(e.target.value),
                    )
                  }
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., hello, hi, hey"
                  isDisabled={isSubmitting}
                  className="h-16"
                />
              </FormControl>
            </div>
          )}

          {/* Engagement Bot Settings */}
          {showEngagementSettings && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Engagement Settings</h3>

              <FormControl label="Actions to Perform">
                <div className="flex flex-wrap gap-3">
                  {ENGAGEMENT_ACTIONS.map(({ value, label }) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 border-input accent-primary"
                        checked={
                          engagementSettings.actions?.includes(value) ?? false
                        }
                        onChange={() =>
                          handleArrayToggle(
                            'engagementSettings',
                            'actions',
                            value,
                            { actions: [EngagementAction.LIKE] },
                          )
                        }
                        disabled={isSubmitting}
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </FormControl>

              <FormControl label="Target Keywords (comma separated)">
                <FormTextarea
                  name="targetKeywords"
                  value={(engagementSettings.targetKeywords || []).join(', ')}
                  onChange={(e) =>
                    handleCategorySettingChange(
                      'engagementSettings',
                      'targetKeywords',
                      parseCommaSeparated(e.target.value),
                    )
                  }
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., AI, machine learning, tech"
                  isDisabled={isSubmitting}
                  className="h-16"
                />
              </FormControl>

              <FormControl label="Target Hashtags (comma separated)">
                <FormTextarea
                  name="targetHashtags"
                  value={(engagementSettings.targetHashtags || []).join(', ')}
                  onChange={(e) =>
                    handleCategorySettingChange(
                      'engagementSettings',
                      'targetHashtags',
                      parseCommaSeparated(e.target.value, '#'),
                    )
                  }
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., AI, tech, innovation"
                  isDisabled={isSubmitting}
                  className="h-16"
                />
              </FormControl>

              <FormControl label="Target Accounts (comma separated)">
                <FormTextarea
                  name="targetAccounts"
                  value={(engagementSettings.targetAccounts || []).join(', ')}
                  onChange={(e) =>
                    handleCategorySettingChange(
                      'engagementSettings',
                      'targetAccounts',
                      parseCommaSeparated(e.target.value, '@'),
                    )
                  }
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., elonmusk, OpenAI"
                  isDisabled={isSubmitting}
                  className="h-16"
                />
              </FormControl>

              <div className="grid grid-cols-2 gap-4">
                <FormControl label="Actions Per Hour">
                  <Input
                    type="number"
                    value={engagementSettings.actionsPerHour}
                    onChange={(e) =>
                      handleCategorySettingChange(
                        'engagementSettings',
                        'actionsPerHour',
                        parseInt(e.target.value, 10),
                      )
                    }
                    min={1}
                    max={100}
                    disabled={isSubmitting}
                  />
                </FormControl>

                <FormControl label="Actions Per Day">
                  <Input
                    type="number"
                    value={engagementSettings.actionsPerDay}
                    onChange={(e) =>
                      handleCategorySettingChange(
                        'engagementSettings',
                        'actionsPerDay',
                        parseInt(e.target.value, 10),
                      )
                    }
                    min={1}
                    max={1000}
                    disabled={isSubmitting}
                  />
                </FormControl>
              </div>

              <FormControl label="Delay Between Actions (seconds)">
                <Input
                  type="number"
                  value={engagementSettings.delayBetweenActions}
                  onChange={(e) =>
                    handleCategorySettingChange(
                      'engagementSettings',
                      'delayBetweenActions',
                      parseInt(e.target.value, 10),
                    )
                  }
                  min={5}
                  max={300}
                  disabled={isSubmitting}
                />
              </FormControl>

              <FormControl label="Only Verified Accounts">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 border-input accent-primary"
                    checked={engagementSettings.onlyVerified ?? false}
                    onChange={(e) =>
                      handleCategorySettingChange(
                        'engagementSettings',
                        'onlyVerified',
                        e.target.checked,
                      )
                    }
                    disabled={isSubmitting}
                  />
                  <span className="text-sm">
                    Only engage with verified accounts
                  </span>
                </label>
              </FormControl>
            </div>
          )}

          {/* Monitoring Bot Settings */}
          {showMonitoringSettings && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Monitoring Settings</h3>

              <FormControl label="Keywords to Monitor (comma separated)">
                <FormTextarea
                  name="keywords"
                  value={(monitoringSettings.keywords || []).join(', ')}
                  onChange={(e) =>
                    handleCategorySettingChange(
                      'monitoringSettings',
                      'keywords',
                      parseCommaSeparated(e.target.value),
                    )
                  }
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., brand name, competitor, product"
                  isDisabled={isSubmitting}
                  className="h-20"
                />
              </FormControl>

              <FormControl label="Hashtags to Monitor (comma separated)">
                <FormTextarea
                  name="hashtags"
                  value={(monitoringSettings.hashtags || []).join(', ')}
                  onChange={(e) =>
                    handleCategorySettingChange(
                      'monitoringSettings',
                      'hashtags',
                      parseCommaSeparated(e.target.value, '#'),
                    )
                  }
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., yourbrand, industry"
                  isDisabled={isSubmitting}
                  className="h-16"
                />
              </FormControl>

              <FormControl label="Exclude Keywords (comma separated)">
                <FormTextarea
                  name="excludeKeywords"
                  value={(monitoringSettings.excludeKeywords || []).join(', ')}
                  onChange={(e) =>
                    handleCategorySettingChange(
                      'monitoringSettings',
                      'excludeKeywords',
                      parseCommaSeparated(e.target.value),
                    )
                  }
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., spam, unrelated"
                  isDisabled={isSubmitting}
                  className="h-16"
                />
              </FormControl>

              <FormControl label="Alert Types">
                <div className="flex flex-wrap gap-3">
                  {ALERT_TYPES.map(({ value, label }) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 border-input accent-primary"
                        checked={
                          monitoringSettings.alertTypes?.includes(value) ??
                          false
                        }
                        onChange={() =>
                          handleArrayToggle(
                            'monitoringSettings',
                            'alertTypes',
                            value,
                            { alertTypes: [MonitoringAlertType.IN_APP] },
                          )
                        }
                        disabled={isSubmitting}
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </FormControl>

              {monitoringSettings.alertTypes?.includes(
                MonitoringAlertType.EMAIL,
              ) && (
                <FormControl label="Alert Email">
                  <FormInput
                    type="email"
                    name="alertEmail"
                    value={monitoringSettings.alertEmail || ''}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      handleCategorySettingChange(
                        'monitoringSettings',
                        'alertEmail',
                        e.target.value,
                      )
                    }
                    placeholder="alerts@example.com"
                    isDisabled={isSubmitting}
                  />
                </FormControl>
              )}

              {monitoringSettings.alertTypes?.includes(
                MonitoringAlertType.WEBHOOK,
              ) && (
                <FormControl label="Webhook URL">
                  <FormInput
                    type="url"
                    name="alertWebhookUrl"
                    value={monitoringSettings.alertWebhookUrl || ''}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      handleCategorySettingChange(
                        'monitoringSettings',
                        'alertWebhookUrl',
                        e.target.value,
                      )
                    }
                    placeholder="https://your-webhook.com/endpoint"
                    isDisabled={isSubmitting}
                  />
                </FormControl>
              )}

              {monitoringSettings.alertTypes?.includes(
                MonitoringAlertType.SLACK,
              ) && (
                <FormControl label="Slack Webhook URL">
                  <FormInput
                    type="url"
                    name="alertSlackWebhookUrl"
                    value={monitoringSettings.alertSlackWebhookUrl || ''}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      handleCategorySettingChange(
                        'monitoringSettings',
                        'alertSlackWebhookUrl',
                        e.target.value,
                      )
                    }
                    placeholder="https://hooks.slack.com/services/..."
                    isDisabled={isSubmitting}
                  />
                </FormControl>
              )}

              <FormControl label="Alert Frequency">
                <Select
                  value={monitoringSettings.alertFrequency}
                  onValueChange={(value) =>
                    handleCategorySettingChange(
                      'monitoringSettings',
                      'alertFrequency',
                      value,
                    )
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instant">Instant</SelectItem>
                    <SelectItem value="hourly">Hourly Digest</SelectItem>
                    <SelectItem value="daily">Daily Digest</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
            </div>
          )}

          {/* Publishing Bot Settings */}
          {showPublishingSettings && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Publishing Settings</h3>

              <FormControl label="Content Source">
                <Select
                  value={publishingSettings.contentSourceType}
                  onValueChange={(value) =>
                    handleCategorySettingChange(
                      'publishingSettings',
                      'contentSourceType',
                      value,
                    )
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="queue">Content Queue</SelectItem>
                    <SelectItem value="template">Template</SelectItem>
                    <SelectItem value="ai_generated">AI Generated</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>

              {publishingSettings.contentSourceType === 'ai_generated' && (
                <FormControl label="AI Prompt">
                  <FormTextarea
                    name="aiPrompt"
                    value={publishingSettings.aiPrompt || ''}
                    onChange={(e) =>
                      handleCategorySettingChange(
                        'publishingSettings',
                        'aiPrompt',
                        e.target.value,
                      )
                    }
                    onKeyDown={handleKeyDown}
                    placeholder="Generate a tweet about..."
                    isDisabled={isSubmitting}
                    className="h-24"
                  />
                </FormControl>
              )}

              <FormControl label="Publishing Frequency">
                <Select
                  value={publishingSettings.frequency}
                  onValueChange={(value) =>
                    handleCategorySettingChange(
                      'publishingSettings',
                      'frequency',
                      value,
                    )
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PUBLISHING_FREQUENCIES.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>

              {publishingSettings.frequency === PublishingFrequency.CUSTOM && (
                <FormControl label="Custom Cron Expression">
                  <FormInput
                    type="text"
                    name="customCronExpression"
                    value={publishingSettings.customCronExpression || ''}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      handleCategorySettingChange(
                        'publishingSettings',
                        'customCronExpression',
                        e.target.value,
                      )
                    }
                    placeholder="0 */2 * * *"
                    isDisabled={isSubmitting}
                  />
                </FormControl>
              )}

              <FormControl label="Max Posts Per Day">
                <Input
                  type="number"
                  value={publishingSettings.maxPostsPerDay}
                  onChange={(e) =>
                    handleCategorySettingChange(
                      'publishingSettings',
                      'maxPostsPerDay',
                      parseInt(e.target.value, 10),
                    )
                  }
                  min={1}
                  max={50}
                  disabled={isSubmitting}
                />
              </FormControl>

              <FormControl label="Timezone">
                <Select
                  value={publishingSettings.timezone}
                  onValueChange={(value) =>
                    handleCategorySettingChange(
                      'publishingSettings',
                      'timezone',
                      value,
                    )
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="America/New_York">
                      Eastern Time (ET)
                    </SelectItem>
                    <SelectItem value="America/Chicago">
                      Central Time (CT)
                    </SelectItem>
                    <SelectItem value="America/Denver">
                      Mountain Time (MT)
                    </SelectItem>
                    <SelectItem value="America/Los_Angeles">
                      Pacific Time (PT)
                    </SelectItem>
                    <SelectItem value="Europe/London">London (GMT)</SelectItem>
                    <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                    <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>

              <FormControl label="Auto-Add Hashtags (comma separated)">
                <FormTextarea
                  name="autoHashtags"
                  value={(publishingSettings.autoHashtags || []).join(', ')}
                  onChange={(e) =>
                    handleCategorySettingChange(
                      'publishingSettings',
                      'autoHashtags',
                      parseCommaSeparated(e.target.value, '#'),
                    )
                  }
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., AI, tech, startup"
                  isDisabled={isSubmitting}
                  className="h-16"
                />
              </FormControl>

              <FormControl label="Append Signature">
                <FormInput
                  type="text"
                  name="appendSignature"
                  value={publishingSettings.appendSignature || ''}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    handleCategorySettingChange(
                      'publishingSettings',
                      'appendSignature',
                      e.target.value,
                    )
                  }
                  placeholder="e.g., - Sent via GenFeed"
                  isDisabled={isSubmitting}
                />
              </FormControl>
            </div>
          )}
        </div>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={() => closeModal()}
            isLoading={isSubmitting}
          />

          {bot && handleDelete && (
            <Button
              label={<HiTrash />}
              variant={ButtonVariant.DESTRUCTIVE}
              onClick={handleDelete}
              isLoading={isSubmitting}
            />
          )}

          <Button
            type="submit"
            label={bot ? 'Update' : 'Create'}
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}
