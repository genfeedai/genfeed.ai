import '@genfeedai/contracts/interfaces';

declare module '@genfeedai/contracts/interfaces' {
  interface IBatchItem {
    gateOverallScore?: number;
    gateReasons?: string[];
    opportunitySourceType?: 'trend' | 'event' | 'evergreen';
    opportunityTopic?: string;
  }
}
