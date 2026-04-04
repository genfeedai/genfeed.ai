/**
 * Notification event payload interfaces
 * Used by NotificationsPublisherService for type-safe event publishing
 */
export interface IVideoProgressPayload {
    path: string;
    progress: number;
    userId: string;
    room?: string;
}
export interface IVideoCompletePayload {
    path: string;
    result: IMediaResult;
    userId: string;
    room?: string;
}
export interface IMediaFailedPayload {
    path: string;
    error: string | Error | Record<string, unknown>;
    userId: string;
    room?: string;
}
export interface IMediaResult {
    id?: string;
    videoId?: string;
    imageId?: string;
    musicId?: string;
    url?: string;
    thumbnailUrl?: string;
    duration?: number;
    width?: number;
    height?: number;
    metadata?: Record<string, unknown>;
    eventType?: string;
    [key: string]: unknown;
}
export interface INotificationPayload {
    userId?: string;
    organizationId?: string;
    notification: INotificationData;
}
export interface INotificationData {
    type: string;
    title: string;
    message: string;
    link?: string;
    metadata?: Record<string, unknown>;
}
export interface IIngredientStatusPayload {
    ingredientId: string;
    status: string;
    userId: string;
    metadata?: IIngredientStatusMetadata;
}
export interface IIngredientStatusMetadata {
    label?: string;
    category?: string;
    url?: string;
    thumbnailUrl?: string;
    error?: string;
    [key: string]: unknown;
}
export interface IPublicationStatusPayload {
    postId: string;
    status: string;
    userId: string;
    metadata?: IPublicationStatusMetadata;
}
export interface IPublicationStatusMetadata {
    platform?: string;
    externalId?: string;
    url?: string;
    error?: string;
    [key: string]: unknown;
}
export interface ITrainingStatusPayload {
    trainingId: string;
    status: string;
    userId: string;
    metadata?: ITrainingStatusMetadata;
}
export interface ITrainingStatusMetadata {
    progress?: number;
    stage?: string;
    model?: string;
    error?: string;
    [key: string]: unknown;
}
export interface IAssetStatusPayload {
    assetId: string;
    status: string;
    userId: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}
export interface IFileProcessingPayload {
    jobId: string;
    type: string;
    status: string;
    userId: string;
    ingredientId: string;
    progress?: number;
}
export interface IJobLifecyclePayload {
    jobId: string;
    queueType: string;
    status: string;
    timestamp: string;
    [key: string]: unknown;
}
export interface ITaskStatusPayload {
    taskId: string;
    status: string;
    userId: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}
export interface IArticleStatusPayload {
    articleId: string;
    status: string;
    userId: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}
export interface IWorkflowStatusPayload {
    workflowId: string;
    status: string;
    userId: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}
export interface IBrandRefreshPayload {
    brandId: string;
    userId: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}
export interface IBackgroundTaskUpdatePayload {
    taskId: string;
    activityId?: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress?: number;
    resultId?: string;
    resultType?: 'VIDEO' | 'IMAGE' | 'MUSIC';
    error?: string;
    label?: string;
    userId: string;
    room?: string;
    timestamp: string;
}
export interface IGenericEventPayload {
    path: string;
    data: unknown;
}
//# sourceMappingURL=notification-events.interface.d.ts.map