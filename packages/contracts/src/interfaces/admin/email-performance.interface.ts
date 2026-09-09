export interface IEmailPerformanceRow {
  templateKey: string;
  queued: number;
  accepted: number;
  delivered: number;
  bounced: number;
  complained: number;
  opened: number;
  clicked: number;
  converted: number;
}

export interface IEmailPerformanceReport {
  id: string;
  from: string;
  to: string;
  asOf: string;
  rows: IEmailPerformanceRow[];
}

export interface IEmailPerformanceQuery {
  from?: string;
  to?: string;
}
