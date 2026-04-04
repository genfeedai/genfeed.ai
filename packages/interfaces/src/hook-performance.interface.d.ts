export interface IHookPerformance {
    hookId: string;
    organizationId: string;
    brandId: string;
    hookFormula: string;
    hookText: string;
    captionHook: string;
    niche: string;
    product: string;
    slideCount: number;
    imageModel: string;
    slidePrompts: string[];
    postId: string | null;
    platform: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    engagementRate: number;
    completionRate: number;
    publishedAt: Date | null;
    lastAnalyticsAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
export interface IHookPerformanceSummary {
    hookFormula: string;
    totalPosts: number;
    avgViews: number;
    avgEngagementRate: number;
    topPerformer: {
        hookText: string;
        views: number;
        engagementRate: number;
    } | null;
}
export interface IPromptVersion {
    versionId: string;
    organizationId: string;
    brandId: string;
    nodeType: string;
    promptTemplate: string;
    variables: Record<string, string>;
    resolvedPrompt: string;
    hookPerformanceId: string | null;
    postId: string | null;
    performanceScore: number | null;
    createdAt: Date;
}
//# sourceMappingURL=hook-performance.interface.d.ts.map