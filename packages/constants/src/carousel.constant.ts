import { CredentialPlatform } from '@genfeedai/enums';

export interface CarouselLimit {
  min: number;
  max: number;
  name: string;
}

export const CAROUSEL_LIMITS: Partial<
  Record<CredentialPlatform, CarouselLimit>
> = {
  [CredentialPlatform.INSTAGRAM]: { max: 10, min: 2, name: 'Instagram' },
  [CredentialPlatform.TIKTOK]: { max: 35, min: 2, name: 'TikTok' },
  [CredentialPlatform.TWITTER]: { max: 4, min: 2, name: 'X (Twitter)' },
  [CredentialPlatform.LINKEDIN]: { max: 9, min: 2, name: 'LinkedIn' },
};
