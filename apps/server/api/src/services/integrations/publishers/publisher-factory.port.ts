import type { CredentialPlatform } from '@genfeedai/contracts';
import type { IPublisher } from './interfaces/publisher.interface';

/** API-owned publisher registry consumed by server runtimes. */
export interface ServerPublisherFactory {
  getPublisher(platform: string): IPublisher | null;
  getSupportedPlatforms(): CredentialPlatform[];
  isSupported(platform: string): boolean;
}
