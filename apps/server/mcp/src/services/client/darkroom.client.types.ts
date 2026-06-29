/** Parameter types for DarkroomClient methods. */

export interface StartTrainingParams {
  handle: string;
  steps?: number;
  rank?: number;
  learningRate?: number;
}

export interface GenerateDarkroomContentParams {
  type: string;
  prompt?: string;
  count?: number;
  personaHandle?: string;
}
