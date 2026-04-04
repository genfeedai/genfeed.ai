import type { AlertFrequency, BotCategory, BotLivestreamMessageType, BotLivestreamSessionStatus, BotLivestreamTargetAudience, BotPlatform, BotScope, BotStatus, ContentSourceType, EngagementAction, MonitoringAlertType, PublishingFrequency } from '@genfeedai/enums';
export interface IBotTarget {
    platform: BotPlatform;
    channelId: string;
    channelLabel?: string;
    channelUrl?: string;
    credentialId?: string;
    liveChatId?: string;
    senderId?: string;
    isEnabled: boolean;
}
export interface IBotResponseTemplate {
    trigger: string;
    response: string;
}
export interface IBotSettings {
    messagesPerMinute: number;
    responseDelaySeconds: number;
    triggers: string[];
    responses: IBotResponseTemplate[];
}
export interface IEngagementBotSettings {
    actions: EngagementAction[];
    targetKeywords: string[];
    targetHashtags: string[];
    targetAccounts: string[];
    excludeAccounts: string[];
    actionsPerHour: number;
    actionsPerDay: number;
    minFollowers?: number;
    maxFollowers?: number;
    onlyVerified?: boolean;
    delayBetweenActions: number;
}
export interface IMonitoringBotSettings {
    keywords: string[];
    hashtags: string[];
    mentionAccounts: string[];
    excludeKeywords: string[];
    alertTypes: MonitoringAlertType[];
    alertEmail?: string;
    alertWebhookUrl?: string;
    alertSlackWebhookUrl?: string;
    alertFrequency: AlertFrequency;
    minEngagement?: number;
    onlyVerified?: boolean;
}
export interface IPublishingBotSettings {
    frequency: PublishingFrequency;
    customCronExpression?: string;
    timezone: string;
    contentSourceType: ContentSourceType;
    contentQueueId?: string;
    templateId?: string;
    aiPrompt?: string;
    maxPostsPerDay: number;
    scheduledTimes?: string[];
    daysOfWeek?: number[];
    autoHashtags?: string[];
    appendSignature?: string;
}
export interface IBotLivestreamLink {
    id: string;
    label: string;
    url: string;
}
export interface IBotLivestreamMessageTemplate {
    id: string;
    type: BotLivestreamMessageType;
    text: string;
    enabled: boolean;
    platforms?: BotPlatform[];
}
export interface IBotLivestreamSettings {
    automaticPosting: boolean;
    scheduledCadenceMinutes: number;
    minimumMessageGapSeconds: number;
    maxAutoPostsPerHour: number;
    transcriptEnabled: boolean;
    transcriptLookbackMinutes: number;
    manualOverrideTtlMinutes: number;
    prioritizeYoutube: boolean;
    targetAudience: BotLivestreamTargetAudience[];
    links: IBotLivestreamLink[];
    messageTemplates: IBotLivestreamMessageTemplate[];
}
export interface IBotLivestreamManualOverride {
    topic?: string;
    promotionAngle?: string;
    activeLinkId?: string;
    expiresAt?: string;
}
export interface IBotLivestreamContextState {
    currentTopic?: string;
    promotionAngle?: string;
    transcriptSummary?: string;
    transcriptConfidence?: number;
    manualOverride?: IBotLivestreamManualOverride;
    source?: 'manual_override' | 'transcript' | 'none';
}
export interface IBotLivestreamPlatformState {
    platform: BotPlatform;
    lastPostedAt?: string;
    hourWindowStartedAt?: string;
    hourlyPostCount: number;
    lastError?: string;
}
export interface IBotLivestreamDeliveryRecord {
    id: string;
    platform: BotPlatform;
    type: BotLivestreamMessageType;
    status: 'sent' | 'skipped' | 'failed';
    message: string;
    reason?: string;
    targetId?: string;
    createdAt: string;
}
export interface IBotLivestreamSession {
    id: string;
    bot: string;
    organization?: string;
    brand?: string;
    user?: string;
    status: BotLivestreamSessionStatus;
    context: IBotLivestreamContextState;
    platformStates: IBotLivestreamPlatformState[];
    deliveryHistory: IBotLivestreamDeliveryRecord[];
    startedAt?: string;
    stoppedAt?: string;
    pausedAt?: string;
    lastTranscriptAt?: string;
}
export interface IBot {
    id: string;
    createdAt: string;
    updatedAt: string;
    label: string;
    description?: string;
    category: BotCategory;
    status: BotStatus;
    scope: BotScope;
    organization?: string;
    brand?: string;
    user?: string;
    platforms: BotPlatform[];
    targets: IBotTarget[];
    settings: IBotSettings;
    engagementSettings?: IEngagementBotSettings;
    monitoringSettings?: IMonitoringBotSettings;
    publishingSettings?: IPublishingBotSettings;
    livestreamSettings?: IBotLivestreamSettings;
    messagesCount: number;
    engagementsCount: number;
    alertsTriggered?: number;
    postsPublished?: number;
    lastActivityAt?: string;
}
//# sourceMappingURL=bot.interface.d.ts.map