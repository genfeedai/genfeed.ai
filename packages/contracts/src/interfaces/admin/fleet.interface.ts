export interface IFleetWorkloadCapabilities {
  images: boolean;
  videos: boolean;
  voices: boolean;
  llm: boolean;
}

export interface IFleetCapabilities {
  brandEnabled: boolean;
  fleet: IFleetWorkloadCapabilities;
}
