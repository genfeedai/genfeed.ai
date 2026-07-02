import '@genfeedai/interfaces';

declare module '@genfeedai/interfaces' {
  interface IBatchItem {
    gateOverallScore?: number;
    gateReasons?: string[];
    opportunitySourceType?: 'trend' | 'event' | 'evergreen';
    opportunityTopic?: string;
  }
}
