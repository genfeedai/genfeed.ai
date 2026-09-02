export interface IViralHook {
  timestamp: number;
  duration: number;
  description: string;
  effectiveness: number;
  type: 'visual' | 'verbal' | 'narrative' | 'structural';
}

export interface IViralPlatformMetrics {
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
}

export interface IViralHookVideo {
  id: string;
  title: string;
  thumbnail?: string;
  creator: string;
  uploadDate: string;
  duration: number;
  hooks: IViralHook[];
  platforms: IViralPlatformMetrics[];
  totalTimeTracked: number;
  analysisNotes?: string;
}

export interface ITopPerformingPlatform {
  platform: string;
  avgViralScore: number;
  totalViews: number;
}

export interface IHookTypeEffectiveness {
  type: string;
  avgEffectiveness: number;
  count: number;
}

export interface IViralHookAnalysis {
  totalVideos: number;
  totalTime: number;
  avgTimePerVideo: number;
  topPlatforms: ITopPerformingPlatform[];
  hookEffectiveness: IHookTypeEffectiveness[];
  topHooks: string[];
}
