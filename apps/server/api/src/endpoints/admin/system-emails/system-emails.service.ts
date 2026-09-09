import { EmailPerformanceReportService } from '@api/services/email-performance/email-performance-report.service';
import {
  LIFECYCLE_SYSTEM_EMAILS,
  type LifecycleSystemEmailDefinition,
} from '@genfeedai/contracts/constants';
import type { IEmailPerformanceQuery } from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminSystemEmailsService {
  constructor(private readonly performance: EmailPerformanceReportService) {}

  getPerformance(query: IEmailPerformanceQuery) {
    return this.performance.getReport(query);
  }

  list(): LifecycleSystemEmailDefinition[] {
    return LIFECYCLE_SYSTEM_EMAILS.map((email) => ({
      ...email,
      paragraphs: [...email.paragraphs],
      skipRules: [...email.skipRules],
    }));
  }
}
