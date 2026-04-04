import {
  CredentialPlatform,
  PostCategory,
  PostEntityModel,
  PostStatus,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type PostDocument = Post & Document;

@Schema({ _id: false })
export class PostReviewEvent {
  @Prop({
    enum: ['approved', 'rejected', 'request_changes'],
    required: true,
    type: String,
  })
  decision!: 'approved' | 'rejected' | 'request_changes';

  @Prop({ required: false, type: String })
  feedback?: string;

  @Prop({ required: true, type: Date })
  reviewedAt!: Date;
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'posts',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class Post {
  // Polymorphic entity reference (Ingredient OR Article)
  @Prop({
    refPath: 'entityModel',
    required: false,
    type: Types.ObjectId,
  })
  entity?: Types.ObjectId;

  @Prop({
    enum: Object.values(PostEntityModel),
    required: false,
    type: String,
  })
  entityModel?: PostEntityModel;

  // Carousel support - array of ingredients (order preserved)
  @Prop({
    ref: 'Ingredient',
    required: false,
    type: [Types.ObjectId],
  })
  ingredients?: Types.ObjectId[];

  @Prop({
    ref: 'Credential',
    required: true,
    type: Types.ObjectId,
  })
  credential!: Types.ObjectId;

  @Prop({
    enum: Object.values(CredentialPlatform),
    required: true,
    type: String,
  })
  platform!: CredentialPlatform;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    ref: 'Brand',
    required: true,
    type: Types.ObjectId,
  })
  brand!: Types.ObjectId;

  // Threading support (for Twitter threads, etc.)
  @Prop({
    ref: 'Post',
    required: false,
    set: (v: unknown) =>
      v === '' || v === null || v === undefined ? undefined : v,
    type: Types.ObjectId,
  })
  parent?: Types.ObjectId;

  @Prop({
    default: 0,
    required: false,
    type: Number,
  })
  order?: number;

  // Alternative post tracking - reference to the original post this was created from
  // Used for A/B testing and KPI comparison between original and variant posts
  @Prop({
    index: true,
    ref: 'Post',
    required: false,
    set: (v: unknown) =>
      v === '' || v === null || v === undefined ? undefined : v,
    type: Types.ObjectId,
  })
  originalPost?: Types.ObjectId;

  @Prop({
    index: true,
    set: (v: unknown) =>
      v === '' || v === null || v === undefined ? undefined : v,
    sparse: true,
    type: String,
  })
  externalId!: string;

  // Instagram shortcode for URL construction (e.g., "DRQxpmXiAEE")
  // While externalId stores the numeric media ID for API calls
  @Prop({
    required: false,
    set: (v: unknown) =>
      v === '' || v === null || v === undefined ? undefined : v,
    type: String,
  })
  externalShortcode?: string;

  // Twitter-specific: ID of tweet to quote (creates a quote tweet)
  @Prop({
    required: false,
    set: (v: unknown) =>
      v === '' || v === null || v === undefined ? undefined : v,
    type: String,
  })
  quoteTweetId?: string;

  // Group ID for batch post notifications
  // Posts created together (multi-platform batch) share the same groupId
  @Prop({
    index: true,
    required: false,
    set: (v: unknown) =>
      v === '' || v === null || v === undefined ? undefined : v,
    type: String,
  })
  groupId?: string;

  @Prop({ required: false, type: String })
  url?: string;

  @Prop({
    default: 'scheduled',
    enum: PostStatus,
    required: true,
    type: String,
  })
  status!: PostStatus;

  @Prop({ required: false, type: String })
  label!: string;

  @Prop({ required: true, type: String })
  description!: string;

  @Prop({
    default: PostCategory.TEXT,
    enum: PostCategory,
    required: true,
    type: String,
  })
  category!: PostCategory;

  @Prop({
    ref: 'Tag',
    required: false,
    type: [Types.ObjectId],
  })
  tags?: Types.ObjectId[];

  @Prop({ type: Date })
  scheduledDate!: Date;

  @Prop({ default: 'UTC', type: String })
  timezone!: string;

  @Prop({ type: Date })
  publicationDate!: Date;

  @Prop({ required: false, type: Date })
  publishedAt?: Date;

  @Prop({ required: false, type: Date })
  uploadedAt?: Date;

  @Prop({ type: Date })
  nextScheduledDate!: Date;

  @Prop({ default: false, type: Boolean })
  isRepeat!: boolean;

  @Prop({ type: String })
  repeatFrequency!: string;

  @Prop({ type: Number })
  repeatInterval!: number;

  @Prop({ type: Date })
  repeatEndDate!: Date;

  @Prop({ type: Number })
  maxRepeats!: number;

  @Prop({ type: Number })
  repeatCount!: number;

  @Prop({ type: [Number] })
  repeatDaysOfWeek!: number[];

  // Instagram Reels - whether to share reel to main feed
  @Prop({ default: true, required: false, type: Boolean })
  isShareToFeedSelected?: boolean;

  // Analytics tracking control - whether to fetch analytics for this post
  @Prop({ default: true, type: Boolean })
  isAnalyticsEnabled?: boolean;

  // Retry tracking for failed posts
  @Prop({ default: 0, type: Number })
  retryCount?: number;

  // Last publish attempt timestamp - used for retry backoff
  @Prop({ required: false, type: Date })
  lastAttemptAt?: Date;

  @Prop({
    ref: 'Persona',
    required: false,
    type: Types.ObjectId,
  })
  persona?: Types.ObjectId;

  // Closed-loop: links post back to the generation workflow
  @Prop({ index: true, required: false, type: String })
  generationId?: string;

  @Prop({
    ref: 'WorkflowExecution',
    required: false,
    type: Types.ObjectId,
  })
  workflowExecutionId?: Types.ObjectId;

  @Prop({ required: false, type: String })
  promptUsed?: string;

  @Prop({ required: false, type: String })
  reviewBatchId?: string;

  @Prop({ required: false, type: String })
  reviewItemId?: string;

  @Prop({
    enum: ['approved', 'rejected', 'request_changes'],
    required: false,
    type: String,
  })
  reviewDecision?: 'approved' | 'rejected' | 'request_changes';

  @Prop({ required: false, type: String })
  reviewFeedback?: string;

  @Prop({ required: false, type: Date })
  reviewedAt?: Date;

  @Prop({ default: [], type: [PostReviewEvent] })
  reviewEvents?: PostReviewEvent[];

  @Prop({ required: false, type: String })
  sourceActionId?: string;

  @Prop({ required: false, type: String })
  sourceWorkflowId?: string;

  @Prop({ required: false, type: String })
  sourceWorkflowName?: string;

  // Agent attribution — set when created by a proactive agent run
  @Prop({ index: true, ref: 'AgentRun', required: false, type: Types.ObjectId })
  agentRunId?: Types.ObjectId;

  @Prop({
    index: true,
    ref: 'AgentStrategy',
    required: false,
    type: Types.ObjectId,
  })
  agentStrategyId?: Types.ObjectId;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  // Timestamps (automatically managed by Mongoose when timestamps: true)
  createdAt!: Date;

  updatedAt!: Date;

  // Virtual fields
  children?: Types.ObjectId[];
}

export const PostSchema = SchemaFactory.createForClass(Post);

// Compound indexes for query optimization
// Index for scheduled post queries (cron job)
PostSchema.index(
  { isDeleted: 1, parent: 1, scheduledDate: 1, status: 1 },
  { name: 'idx_scheduled_posts' },
);

// Index for organization + status queries (common listing pattern)
PostSchema.index(
  { isDeleted: 1, organization: 1, status: 1 },
  { name: 'idx_org_status' },
);

// Index for brand + status queries
PostSchema.index(
  { brand: 1, isDeleted: 1, status: 1 },
  { name: 'idx_brand_status' },
);

// Index for next scheduled date (repeat posts)
PostSchema.index(
  { isDeleted: 1, nextScheduledDate: 1, status: 1 },
  { name: 'idx_next_scheduled' },
);

// Index for superadmin org filtering with default sort
PostSchema.index(
  { createdAt: -1, isDeleted: 1, organization: 1 },
  { name: 'idx_org_created_at' },
);

// Index for superadmin brand filtering with default sort
PostSchema.index(
  { brand: 1, createdAt: -1, isDeleted: 1 },
  { name: 'idx_brand_created_at' },
);
