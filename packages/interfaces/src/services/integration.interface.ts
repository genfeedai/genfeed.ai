import type { IBaseEntity } from '../index';

export interface IServiceIntegration extends IBaseEntity {
  status: IServiceIntegrationStatus;
}

export interface IServiceIntegrationStatus {
  prompt: number;
  script: number;
  voice: number;
  image: number;
  imageToVideo: number;
  video: number;
}
