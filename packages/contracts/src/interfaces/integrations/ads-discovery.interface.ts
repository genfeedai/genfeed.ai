import type {
  AdWatchlistPlatform,
  CreateAdWatchedAdvertiserInput,
} from './ads-research.interface';

export interface AdsDiscoveryQuery {
  brandId?: string;
  countries?: string;
  keyword: string;
  mediaType?: 'visual' | 'image' | 'video';
  limit?: number;
  platform: AdWatchlistPlatform;
}
export interface AdsDiscoverySample {
  id: string;
  adPerformanceId?: string;
  mediaType?: 'image' | 'video';
  archiveUrl?: string;
  headline?: string;
  mediaUrls: string[];
  imageUrls: string[];
  videoUrls: string[];
  startedAt?: string;
}
export interface AdsDiscoveryAdvertiser {
  id: string;
  name: string;
  handle?: string;
  externalAdvertiserId?: string;
  fundingEntity?: string;
  landingDomain?: string;
  platforms: string[];
  countries: string[];
  creativeCount: number;
  activeCreativeCount?: number;
  earliestStartDate?: string;
  longevityDays?: number;
  reachEstimateMin?: number;
  reachEstimateMax?: number;
  samples: AdsDiscoverySample[];
  watchInput?: CreateAdWatchedAdvertiserInput;
}
export interface AdsDiscoveryResponse {
  id: string;
  status: 'ready' | 'empty' | 'pending' | 'unavailable' | 'unsupported';
  reason?: string;
  capability: 'keyword' | 'advertiser_lookup' | 'unsupported';
  documentationUrl: string;
  platform: AdWatchlistPlatform;
  query: string;
  countries: string[];
  advertisers: AdsDiscoveryAdvertiser[];
  sampleCount: number;
  startedAt?: string;
  expiresAt?: string;
}
