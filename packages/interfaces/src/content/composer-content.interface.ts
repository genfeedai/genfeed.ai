import type { Platform } from '@genfeedai/enums';
import type { IBrand } from '../index';

export interface ITwitterAccount extends IBrand {
  platform: Platform.TWITTER;
}

export interface ILinkedInAccount extends IBrand {
  platform: Platform.LINKEDIN;
}

export interface IRedditAccount extends IBrand {
  platform: Platform.REDDIT;
}
