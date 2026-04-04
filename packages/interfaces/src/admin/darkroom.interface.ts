export interface IDarkroomCharacter {
  id: string;
  label: string;
  slug: string;
  bio?: string;
  skinTone?: string;
  eyeColor?: string;
  triggerWord?: string;
  s3Folder?: string;
  niche?: string;
  emoji?: string;
  loraStatus?: string;
  loraModelPath?: string;
  profileImageUrl?: string;
  personaFileS3Key?: string;
  isDarkroomCharacter: boolean;
  selectedImagesCount?: number;
  reviewImagesCount?: number;
  trashedImagesCount?: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IDarkroomAsset {
  id: string;
  url: string;
  label?: string;
  persona?: string;
  personaSlug?: string;
  reviewStatus?: string;
  contentRating?: string;
  campaign?: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IDarkroomTraining {
  id: string;
  label: string;
  personaSlug: string;
  status: string;
  baseModel?: string;
  steps?: number;
  learningRate?: number;
  loraRank?: number;
  progress?: number;
  currentStep?: number;
  totalSteps?: number;
  stage?: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IEC2Instance {
  instanceId: string;
  name: string;
  role: string;
  state: string;
  instanceType: string;
}

export interface IFleetInstanceHealth {
  service: string;
  status: string;
  timestamp: string;
  uptime: number;
  memory: { rss: number; heapUsed: number; heapTotal: number };
  jobs: {
    active: number;
    queued: number;
    completed: number;
    failed: number;
    total: number;
  };
}

export interface IFleetInstance {
  name: string;
  role: 'images' | 'voices' | 'videos';
  status: 'online' | 'offline' | 'unconfigured';
  url: string;
  responseTimeMs?: number;
  lastChecked: string;
  health?: IFleetInstanceHealth;
}

export interface IFleetHealthResponse {
  instances: IFleetInstance[];
  timestamp: string;
}

export interface IServiceStatus {
  name: string;
  status: 'online' | 'offline' | 'unknown';
  url?: string;
}

export interface IPipelineStats {
  assetsGenerated: number;
  assetsPendingReview: number;
  assetsPublished: number;
  trainingsActive: number;
}

export interface IPipelineCampaign {
  id: string;
  name: string;
  status: string;
  assetsCount: number;
  createdAt: string;
}

export interface IDarkroomFleetCapabilities {
  images: boolean;
  videos: boolean;
  voices: boolean;
  llm: boolean;
}

export interface IDarkroomCapabilities {
  brandEnabled: boolean;
  fleet: IDarkroomFleetCapabilities;
}
