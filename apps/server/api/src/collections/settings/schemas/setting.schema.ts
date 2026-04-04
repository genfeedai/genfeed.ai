import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type SettingDocument = Setting & Document;

const DASHBOARD_SCOPES = ['organization', 'brand'] as const;

function sanitizeDashboardPreferences(
  input: unknown,
): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const maybeScopes = (input as { scopes?: unknown }).scopes;
  if (!maybeScopes || typeof maybeScopes !== 'object') {
    return { scopes: {} };
  }

  const resultScopes: Record<string, unknown> = {};

  for (const scope of DASHBOARD_SCOPES) {
    const rawScope = (maybeScopes as Record<string, unknown>)[scope];
    if (!rawScope || typeof rawScope !== 'object') {
      continue;
    }

    const rawBlocks = (rawScope as { blocks?: unknown }).blocks;
    const blocks = Array.isArray(rawBlocks) ? rawBlocks.slice(0, 50) : [];
    const isAgentModified = Boolean(
      (rawScope as { isAgentModified?: unknown }).isAgentModified,
    );
    const versionRaw = (rawScope as { version?: unknown }).version;
    const version =
      typeof versionRaw === 'number' && Number.isFinite(versionRaw)
        ? versionRaw
        : 1;

    resultScopes[scope] = {
      blocks,
      isAgentModified,
      updatedAt: new Date().toISOString(),
      version,
    };
  }

  return { scopes: resultScopes };
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'settings',
  timestamps: true,
  versionKey: false,
})
export class Setting {
  _id!: string;

  @Prop({
    ref: 'User',
    type: Types.ObjectId,
    unique: true,
  })
  user!: Types.ObjectId;

  @Prop({ default: 'dark', type: String })
  theme!: string;

  @Prop({ default: false, type: Boolean })
  isVerified!: boolean;

  @Prop({ default: true, type: Boolean })
  isFirstLogin!: boolean;

  @Prop({ default: false, type: Boolean })
  isMenuCollapsed!: boolean;

  @Prop({ default: true, type: Boolean })
  isSidebarProgressVisible!: boolean;

  @Prop({ default: false, type: Boolean })
  isSidebarProgressCollapsed!: boolean;

  @Prop({ default: true, type: Boolean })
  isAdvancedMode!: boolean;

  // Trend notification preferences
  @Prop({ default: true, type: Boolean })
  isTrendNotificationsInApp!: boolean;

  @Prop({ default: false, type: Boolean })
  isTrendNotificationsTelegram!: boolean;

  @Prop({ default: false, type: Boolean })
  isTrendNotificationsEmail!: boolean;

  @Prop({ default: false, type: Boolean })
  isWorkflowNotificationsEmail!: boolean;

  @Prop({ default: false, type: Boolean })
  isVideoNotificationsEmail!: boolean;

  @Prop({ type: String })
  trendNotificationsTelegramChatId?: string;

  @Prop({ type: String })
  trendNotificationsEmailAddress?: string;

  @Prop({
    default: 'daily',
    enum: ['realtime', 'hourly', 'daily', 'weekly'],
    type: String,
  })
  trendNotificationsFrequency!: string;

  @Prop({ default: 70, type: Number })
  trendNotificationsMinViralScore!: number;

  @Prop({
    default: [],
    enum: ['image', 'video', 'avatar', 'music'],
    type: [String],
  })
  contentPreferences!: string[];

  @Prop({ default: [], type: [String] })
  favoriteModelKeys!: string[];

  @Prop({ default: 'deepseek/deepseek-chat', type: String })
  defaultAgentModel!: string;

  @Prop({ default: false, type: Boolean })
  isAgentAssetsPanelOpen!: boolean;

  @Prop({
    default: 'quality',
    enum: ['quality', 'speed', 'cost', 'balanced'],
    type: String,
  })
  generationPriority!: string;

  @Prop({
    default: { scopes: {} },
    set: sanitizeDashboardPreferences,
    type: Object,
  })
  dashboardPreferences?: Record<string, unknown>;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const SettingSchema = SchemaFactory.createForClass(Setting);
