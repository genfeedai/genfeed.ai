'use client';

import {
  evaluateOutreachCapability,
  isOutreachPairExecutable,
} from '@api-types/contracts/outreach-capabilities.contract';
import { ButtonVariant, CampaignStatus, CampaignType } from '@genfeedai/enums';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { ArrowLeft, Check, Pause, Play, Rocket } from 'lucide-react';
import { useTranslations } from 'next-intl';

import OutreachCampaignAddTargets from './OutreachCampaignAddTargets';
import OutreachCampaignDetailHeader from './OutreachCampaignDetailHeader';
import OutreachCampaignTargetsTable from './OutreachCampaignTargetsTable';
import { useOutreachCampaignDetail } from './useOutreachCampaignDetail';

const CAMPAIGN_KPI_PLACEHOLDERS = [
  { description: 'All targets', label: 'Total', value: '-' },
  { description: 'Waiting', label: 'Pending', value: '-' },
  { description: 'In progress', label: 'Processing', value: '-' },
  { description: 'Successfully replied', label: 'Replied', value: '-' },
  { description: 'Skipped', label: 'Skipped', value: '-' },
  { description: 'Errors', label: 'Failed', value: '-' },
];

export default function OutreachCampaignDetail() {
  const translate = useTranslations('pages.outreachCampaign');
  const {
    campaign,
    handleAddDmRecipients,
    handleAddUrls,
    handleBack,
    handleCompleteCampaign,
    handlePauseCampaign,
    handleStartCampaign,
    isAddingUrls,
    isLoading,
    isRefreshing,
    loadCampaign,
    setUrlInput,
    targetStats,
    targets,
    urlInput,
  } = useOutreachCampaignDetail();

  if (!isLoading && !campaign) {
    return (
      <Container
        label={translate('notFoundTitle')}
        description={translate('notFoundDescription')}
        icon={Rocket}
      >
        <Button
          label={
            <>
              <ArrowLeft /> {translate('backToSequences')}
            </>
          }
          variant={ButtonVariant.SECONDARY}
          onClick={handleBack}
        />
      </Container>
    );
  }

  const pairEvaluation = campaign
    ? evaluateOutreachCapability({
        campaignType: campaign.campaignType,
        platform: campaign.platform,
      })
    : null;
  const isPairExecutable = pairEvaluation
    ? isOutreachPairExecutable(pairEvaluation)
    : false;
  const unavailableReasonId = 'outreach-campaign-unavailable-reason';

  const kpiItems = campaign
    ? [
        {
          description: 'All targets',
          label: 'Total',
          value: targetStats.total,
        },
        {
          description: 'Waiting',
          label: 'Pending',
          value: targetStats.pending,
        },
        {
          description: 'In progress',
          label: 'Processing',
          value: targetStats.processing,
          valueClassName: 'text-warning',
        },
        {
          description: 'Successfully replied',
          label: 'Replied',
          value: targetStats.replied,
          valueClassName: 'text-success',
        },
        ...(campaign.campaignType === CampaignType.DM_OUTREACH
          ? [
              {
                description: 'DMs successfully sent',
                label: 'DMs Sent',
                value: campaign.totalDmsSent || 0,
                valueClassName: 'text-success',
              },
            ]
          : []),
        {
          description: 'Skipped',
          label: 'Skipped',
          value: targetStats.skipped,
        },
        {
          description: 'Errors',
          label: 'Failed',
          value: targetStats.failed,
          valueClassName: 'text-destructive',
        },
      ]
    : CAMPAIGN_KPI_PLACEHOLDERS;

  return (
    <Container
      label={campaign?.label ?? translate('fallbackTitle')}
      description={campaign?.description || translate('fallbackDescription')}
      icon={Rocket}
      right={
        <>
          <ButtonRefresh
            onClick={() => loadCampaign(true)}
            isRefreshing={isRefreshing}
          />

          {campaign?.status === CampaignStatus.ACTIVE ? (
            <Button
              label={
                <>
                  <Pause /> Pause
                </>
              }
              variant={ButtonVariant.DESTRUCTIVE}
              onClick={handlePauseCampaign}
            />
          ) : campaign && campaign.status !== CampaignStatus.COMPLETED ? (
            <Button
              aria-describedby={
                isPairExecutable ? undefined : unavailableReasonId
              }
              aria-disabled={isPairExecutable ? undefined : true}
              label={
                <>
                  <Play /> Start
                </>
              }
              variant={ButtonVariant.DEFAULT}
              onClick={() => {
                if (!isPairExecutable) {
                  return;
                }
                handleStartCampaign();
              }}
            />
          ) : null}

          {campaign && campaign.status !== CampaignStatus.COMPLETED && (
            <Button
              label={
                <>
                  <Check /> Complete
                </>
              }
              variant={ButtonVariant.SECONDARY}
              onClick={handleCompleteCampaign}
            />
          )}
        </>
      }
    >
      <div className="space-y-6">
        {campaign && !isPairExecutable && pairEvaluation ? (
          <div
            className="border border-border bg-card p-4 text-sm"
            id={unavailableReasonId}
            role="status"
          >
            <p className="font-medium">{pairEvaluation.ui.headline}</p>
            <p className="mt-1 text-foreground/70">{pairEvaluation.ui.body}</p>
          </div>
        ) : null}

        {campaign ? (
          <OutreachCampaignDetailHeader
            platform={campaign.platform}
            status={campaign.status}
            onBack={handleBack}
          />
        ) : null}

        <KPISection
          title="Target Statistics"
          gridCols={{ desktop: 6, mobile: 2, tablet: 3 }}
          items={kpiItems}
          isLoading={isLoading}
        />

        {campaign ? (
          <>
            <OutreachCampaignAddTargets
              campaignType={campaign.campaignType}
              isUnavailable={!isPairExecutable}
              urlInput={urlInput}
              isAddingUrls={isAddingUrls}
              unavailableReason={
                isPairExecutable ? undefined : pairEvaluation?.ui.body
              }
              onUrlInputChange={setUrlInput}
              onAddUrls={handleAddUrls}
              onAddDmRecipients={handleAddDmRecipients}
            />

            <OutreachCampaignTargetsTable
              campaignType={campaign.campaignType}
              targets={targets}
              isRefreshing={isRefreshing}
            />
          </>
        ) : (
          <div
            className="flex items-center justify-center py-20"
            data-testid="outreach-campaign-body-skeleton"
          >
            <div className="animate-spin text-4xl text-primary">⏳</div>
          </div>
        )}
      </div>
    </Container>
  );
}
