export interface QuotaStatus {
  allowed: boolean;
  currentCount: number;
  dailyLimit: number;
  platform: string;
}
