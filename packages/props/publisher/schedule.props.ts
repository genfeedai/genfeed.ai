export interface Schedule {
  id: string;
  contentId: string;
  contentType: string;
  platform: string;
  scheduledAt: Date;
  status: 'pending' | 'published' | 'failed' | 'cancelled';
  schedulingMethod: string;
  expectedEngagement?: number;
  createdAt: Date;
}
