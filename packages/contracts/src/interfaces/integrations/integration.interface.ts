export interface IIntegration {
  id: string;

  status: IIntegrationStatus;

  createdAt: string;
  updatedAt: string;
}

export interface IIntegrationStatus {
  prompt: number;
  script: number;
  voice: number;
  image: number;
  imageToVideo: number;
  video: number;
}
