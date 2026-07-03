export interface EmailDigestJobData {
  organizationId: string;
  brandId: string;
  recipientEmails?: string[];
  startDate?: string;
  endDate?: string;
}
