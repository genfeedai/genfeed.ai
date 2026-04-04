import '@cloud/interfaces';

declare module '@cloud/interfaces' {
  interface IBatchItem {
    gateOverallScore?: number;
    gateReasons?: string[];
    opportunitySourceType?: 'trend' | 'event' | 'evergreen';
    opportunityTopic?: string;
  }
}

export {};
