export type BeehiivPostStatus = 'confirmed' | 'draft';

export interface BeehiivPublication {
  created: number;
  description: string;
  id: string;
  name: string;
  url: string;
}

export interface BeehiivPublicationsResponse {
  data: BeehiivPublication[];
  total_results: number;
}

export interface BeehiivSubscriber {
  created: number;
  email: string;
  id: string;
  status: string;
  utm_source: string;
}

export interface BeehiivSubscribersResponse {
  data: BeehiivSubscriber[];
  limit: number;
  page: number;
  total_results: number;
}

export interface BeehiivCreateSubscriberResponse {
  data: BeehiivSubscriber;
}

export interface BeehiivSubscriberOutcome {
  email: string;
  errorCode?: string;
  errorMessage?: string;
  id: string;
  isRetryable?: boolean;
  status?: string;
  subscriberId?: string;
  success: boolean;
}

export interface BeehiivPost {
  content_html?: string;
  id: string;
  preview_url?: string;
  publish_date?: number;
  status?: string;
  subtitle?: string;
  title?: string;
  web_url?: string;
}

export interface BeehiivCreatePostInput {
  contentHtml: string;
  scheduledAt?: Date;
  status: BeehiivPostStatus;
  title: string;
}

export interface BeehiivCreatePostResponse {
  data: BeehiivPost;
}

export interface BeehiivGetPostResponse {
  data: BeehiivPost;
}
