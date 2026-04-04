type HookType = 'visual' | 'verbal' | 'narrative' | 'structural';

export class ViralHookEntity {
  timestamp: number;
  duration: number;
  description: string;
  effectiveness: number;
  type: HookType;

  constructor(data?: Partial<ViralHookEntity>) {
    this.timestamp = data?.timestamp ?? 0;
    this.duration = data?.duration ?? 0;
    this.description = data?.description ?? '';
    this.effectiveness = data?.effectiveness ?? 0;
    this.type = data?.type ?? 'visual';
  }
}

export class ViralHookPlatformMetricsEntity {
  platform: string;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  saves: number;
  completionRate: number;
  avgWatchTime: number;
  engagementRate: number;
  viralScore: number;

  constructor(data?: Partial<ViralHookPlatformMetricsEntity>) {
    this.platform = data?.platform ?? 'unknown';
    this.views = data?.views ?? 0;
    this.likes = data?.likes ?? 0;
    this.shares = data?.shares ?? 0;
    this.comments = data?.comments ?? 0;
    this.saves = data?.saves ?? 0;
    this.completionRate = data?.completionRate ?? 0;
    this.avgWatchTime = data?.avgWatchTime ?? 0;
    this.engagementRate = data?.engagementRate ?? 0;
    this.viralScore = data?.viralScore ?? 0;
  }
}

export class ViralHookVideoEntity {
  id: string;
  title: string;
  thumbnail?: string;
  creator: string;
  uploadDate: string;
  duration: number;
  hooks: ViralHookEntity[];
  platforms: ViralHookPlatformMetricsEntity[];
  totalTimeTracked: number;
  analysisNotes?: string;

  constructor(data?: Partial<ViralHookVideoEntity>) {
    this.id = data?.id ?? '';
    this.title = data?.title ?? 'Untitled Video';
    this.thumbnail = data?.thumbnail;
    this.creator = data?.creator ?? 'Unknown Creator';
    this.uploadDate = data?.uploadDate ?? new Date().toISOString();
    this.duration = data?.duration ?? 0;
    this.hooks = (data?.hooks ?? []).map((hook) => new ViralHookEntity(hook));
    this.platforms = (data?.platforms ?? []).map(
      (platform) => new ViralHookPlatformMetricsEntity(platform),
    );
    this.totalTimeTracked = data?.totalTimeTracked ?? 0;
    this.analysisNotes = data?.analysisNotes;
  }
}

export interface TopPlatformStats {
  platform: string;
  avgViralScore: number;
  totalViews: number;
}

export interface HookEffectivenessStats {
  type: HookType;
  avgEffectiveness: number;
  count: number;
}

export class ViralHookAnalysisEntity {
  totalVideos: number;
  totalTime: number;
  avgTimePerVideo: number;
  topPlatforms: TopPlatformStats[];
  hookEffectiveness: HookEffectivenessStats[];
  topHooks: string[];

  constructor(data?: Partial<ViralHookAnalysisEntity>) {
    this.totalVideos = data?.totalVideos ?? 0;
    this.totalTime = data?.totalTime ?? 0;
    this.avgTimePerVideo = data?.avgTimePerVideo ?? 0;
    this.topPlatforms = data?.topPlatforms ?? [];
    this.hookEffectiveness =
      data?.hookEffectiveness ??
      (['visual', 'verbal', 'narrative', 'structural'] as HookType[]).map(
        (type) => ({
          avgEffectiveness: 0,
          count: 0,
          type,
        }),
      );
    this.topHooks = data?.topHooks ?? [];
  }
}

export class ViralHookSummaryEntity {
  videos: ViralHookVideoEntity[];
  analysis: ViralHookAnalysisEntity;

  constructor(data?: Partial<ViralHookSummaryEntity>) {
    this.videos = (data?.videos ?? []).map(
      (video) => new ViralHookVideoEntity(video),
    );
    this.analysis = new ViralHookAnalysisEntity(data?.analysis);
  }
}
