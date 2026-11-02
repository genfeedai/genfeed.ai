import type { OutreachCampaign } from '@services/automation/outreach-campaigns.service';

/** One cached read of the outreach sequences list. */
export interface OutreachCampaignsData {
  /** Every campaign in scope; the KPIs summarise all of them. */
  all: OutreachCampaign[];
  /** The current server page the table shows. */
  page: OutreachCampaign[];
}
