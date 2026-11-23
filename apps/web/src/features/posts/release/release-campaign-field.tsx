'use client';

import { SelectField } from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { useCampaigns } from '@/features/campaigns/hooks/use-campaigns';
import type { ReleaseCampaignFieldProps } from '@/features/posts/props/release-drawer.props';

/**
 * Puts a release, and every post in it, into one of the brand's campaigns, or
 * takes it out. The campaign page and its performance roll-up read the same
 * membership, so this is how a tweet joins a campaign after it was written.
 * A campaign that is no longer in the list (archived, or another brand's)
 * stays selectable under its own id so the field never shows a false "none".
 */
export default function ReleaseCampaignField({
  campaignId,
  isDisabled,
  onChange,
}: ReleaseCampaignFieldProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.release.campaign');
  const { campaigns, isLoading } = useCampaigns();
  const current = campaignId ?? '';
  const isListed = campaigns.some((campaign) => campaign.id === current);

  return (
    <SelectField
      isDisabled={isDisabled || isLoading}
      isTextCaseKept={true}
      label={translate('label')}
      name="campaignId"
      onChange={(event) => onChange(event.target.value || null)}
      value={current}
    >
      <option value="">{translate('none')}</option>
      {current && !isListed ? (
        <option value={current}>{translate('unavailable')}</option>
      ) : null}
      {campaigns.map((campaign) => (
        <option key={campaign.id} value={campaign.id}>
          {campaign.name}
        </option>
      ))}
    </SelectField>
  );
}
