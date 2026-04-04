export interface ClientInfo {
  userId: string;
  organizationId?: string;
  socketId: string;
}

export interface VideoProgressEvent {
  path: string;
  progress: number;
  userId: string;
  room?: string;
}

export interface VideoCompleteEvent {
  path: string;
  result: unknown;
  userId: string;
  room?: string;
}

export interface MediaFailedEvent {
  path: string;
  error: unknown;
  userId: string;
  room?: string;
}

export interface NotificationData {
  userId?: string;
  notification: unknown;
  organizationId?: string;
}

export interface IngredientStatusData {
  ingredientId: string;
  status: string;
  userId: string;
  metadata?: unknown;
}

export interface PostStatusData {
  postId: string;
  status: string;
  userId: string;
  metadata?: unknown;
}

export interface TrainingStatusData {
  trainingId: string;
  status: string;
  userId: string;
  progress?: number;
}

export interface FileProcessingData {
  jobId: string;
  type: string;
  status: string;
  progress?: number;
  userId: string;
  ingredientId: string;
}

export interface AssetStatusData {
  assetId: string;
  status: string;
  userId: string;
  metadata?: {
    assetId: string;
    category: string;
    parent?: string;
    parentModel?: string;
  };
  timestamp?: string;
}

export interface ConnectionStatus {
  totalClients: number;
  totalUsers: number;
  users: Array<{
    userId: string;
    connections: number;
  }>;
}

/**
 * Base interface for all webhook update messages
 * Contains flexible payload data that will be forwarded to API
 */
export interface WebSocketUpdateMessage {
  [key: string]: unknown;
}

/**
 * Ingredient update message from frontend
 */
export interface IngredientUpdateMessage extends WebSocketUpdateMessage {
  ingredientId?: string;
  // Other fields are dynamic and handled by API
}

/**
 * Post update message from frontend
 */
export interface PostUpdateMessage extends WebSocketUpdateMessage {
  postId?: string;
  // Other fields are dynamic and handled by API
}

/**
 * Vote creation message from frontend
 */
export interface VoteCreateMessage extends WebSocketUpdateMessage {
  voteType?: string;
  targetId?: string;
  // Other fields are dynamic and handled by API
}

/**
 * Subscription update message from frontend
 */
export interface SubscriptionUpdateMessage extends WebSocketUpdateMessage {
  subscriptionId?: string;
  action?: string;
  // Other fields are dynamic and handled by API
}

/**
 * Background task update data from Redis channel
 * Matches IBackgroundTaskUpdatePayload from notification-events.interface.ts
 */
export interface BackgroundTaskUpdateData {
  activityId?: string;
  currentPhase?: string;
  estimatedDurationMs?: number;
  error?: string;
  etaConfidence?: 'low' | 'medium' | 'high';
  lastEtaUpdateAt?: string;
  label?: string;
  progress?: number;
  remainingDurationMs?: number;
  resultId?: string;
  resultType?: string;
  room?: string;
  startedAt?: string;
  status: string;
  taskId?: string;
  timestamp: string;
  userId: string;
}
