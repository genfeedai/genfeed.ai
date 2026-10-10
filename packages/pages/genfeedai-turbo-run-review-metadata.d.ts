import '@genfeedai/contracts/interfaces';

declare module '@genfeedai/contracts/interfaces' {
  interface ITurboRunItem {
    gateOverallScore?: number;
    gateReasons?: string[];
    opportunitySourceType?: 'trend' | 'event' | 'evergreen';
    opportunityTopic?: string;
  }
}
