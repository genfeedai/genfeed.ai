export type AdsResearchSource = 'public' | 'my_accounts' | 'all';
export type AdsResearchPlatform = 'meta' | 'google';
export type AdsChannel = 'all' | 'search' | 'display' | 'youtube';
export type AdsResearchMetric = 'performanceScore' | 'ctr' | 'roas' | 'conversions' | 'spendEfficiency';
export type AdsResearchTimeframe = 'last_7_days' | 'last_30_days' | 'last_90_days' | 'all_time';
export interface AdsResearchFilters {
    brandId?: string;
    brandName?: string;
    industry?: string;
    source?: AdsResearchSource;
    platform?: AdsResearchPlatform;
    channel?: AdsChannel;
    metric?: AdsResearchMetric;
    timeframe?: AdsResearchTimeframe;
    limit?: number;
    credentialId?: string;
    adAccountId?: string;
    loginCustomerId?: string;
}
export interface AdsResearchPatternSummary {
    id?: string;
    label: string;
    summary: string;
    score?: number;
    examples?: string[];
}
export interface AdsResearchItem {
    id: string;
    sourceId: string;
    source: Exclude<AdsResearchSource, 'all'>;
    platform: AdsResearchPlatform;
    channel: AdsChannel;
    title: string;
    headline?: string;
    body?: string;
    cta?: string;
    previewUrl?: string;
    imageUrls?: string[];
    videoUrls?: string[];
    landingPageUrl?: string;
    accountName?: string;
    accountId?: string;
    campaignId?: string;
    campaignName?: string;
    campaignObjective?: string;
    status?: string;
    industry?: string;
    sourceLabel?: string;
    metricValue?: number;
    metricLabel?: string;
    explanation: string;
    credentialId?: string;
    adAccountId?: string;
    loginCustomerId?: string;
    metrics: {
        spend?: number;
        impressions?: number;
        clicks?: number;
        ctr?: number;
        cpc?: number;
        cpm?: number;
        conversions?: number;
        conversionRate?: number;
        revenue?: number;
        roas?: number;
        performanceScore?: number;
    };
    patternSummary?: AdsResearchPatternSummary[];
}
export interface AdsResearchDetail extends AdsResearchItem {
    creative: {
        headline?: string;
        body?: string;
        cta?: string;
        imageUrls?: string[];
        videoUrls?: string[];
        landingPageUrl?: string;
    };
}
export interface AdsResearchResponse {
    filters: AdsResearchFilters;
    publicAds: AdsResearchItem[];
    connectedAds: AdsResearchItem[];
    summary: {
        publicCount: number;
        connectedCount: number;
        reviewPolicy: string;
        selectedPlatform: AdsResearchPlatform | 'all';
        selectedSource: AdsResearchSource;
    };
}
export interface AdPack {
    headlines: string[];
    primaryText: string;
    cta: string;
    assetCreativeBrief: string;
    targetingNotes: string;
    campaignRecipe: {
        objective: string;
        platform: AdsResearchPlatform;
        channel: AdsChannel;
        budgetStrategy: string;
        placements: string[];
        reviewStatus: 'review_required';
    };
}
export interface CampaignLaunchPrep {
    reviewRequired: true;
    status: 'review_required';
    publishMode: 'paused';
    platform: AdsResearchPlatform;
    channel: AdsChannel;
    credentialId?: string;
    adAccountId?: string;
    loginCustomerId?: string;
    workflowId?: string;
    workflowName?: string;
    adPack: AdPack;
    campaign: {
        name: string;
        objective: string;
        status: 'PAUSED' | 'DRAFT';
        dailyBudget?: number;
    };
    adSet: {
        name: string;
        optimizationGoal: string;
        targeting: Record<string, unknown>;
    };
    ad: {
        name: string;
        headline?: string;
        body?: string;
        linkUrl?: string;
        callToAction?: string;
    };
    notes: string[];
}
export interface AdsResearchWorkflowResult {
    reviewRequired: true;
    workflowId: string;
    workflowName: string;
    workflowDescription?: string;
    adPack: AdPack;
}
//# sourceMappingURL=ads-research.interface.d.ts.map