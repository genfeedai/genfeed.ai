'use client';

import { ButtonVariant, CampaignStatus, CampaignType } from '@genfeedai/enums';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { ArrowLeft, Check, Pause, Play, Rocket } from 'lucide-react';

import OutreachCampaignAddTargets from './OutreachCampaignAddTargets';
import OutreachCampaignDetailHeader from './OutreachCampaignDetailHeader';
import OutreachCampaignTargetsTable from './OutreachCampaignTargetsTable';
import { useOutreachCampaignDetail } from './useOutreachCampaignDetail';

export default function OutreachCampaignDetail() {
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

  if (isLoading) {
    return (
      <Container
        label="Loading..."
        description="Loading campaign details"
        icon={Rocket}
      >
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin text-4xl text-primary">⏳</div>
        </div>
      </Container>
    );
  }

  if (!campaign) {
    return (
      <Container
        label="Campaign Not Found"
        description="The requested campaign could not be found"
        icon={Rocket}
      >
        <Button
          label={
            <>
              <ArrowLeft /> Back to Campaigns
            </>
          }
          variant={ButtonVariant.SECONDARY}
          onClick={handleBack}
        />
      </Container>
    );
  }

  return (
    <Container
      label={campaign.label}
      description={campaign.description || 'Campaign details and targets'}
      icon={Rocket}
      right={
        <>
          <ButtonRefresh
            onClick={() => loadCampaign(true)}
            isRefreshing={isRefreshing}
          />

          {campaign.status === CampaignStatus.ACTIVE ? (
            <Button
              label={
                <>
                  <Pause /> Pause
                </>
              }
              variant={ButtonVariant.DESTRUCTIVE}
              onClick={handlePauseCampaign}
            />
          ) : campaign.status !== CampaignStatus.COMPLETED ? (
            <Button
              label={
                <>
                  <Play /> Start
                </>
              }
              variant={ButtonVariant.DEFAULT}
              onClick={handleStartCampaign}
            />
          ) : null}

          {campaign.status !== CampaignStatus.COMPLETED && (
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
        <OutreachCampaignDetailHeader
          platform={campaign.platform}
          status={campaign.status}
          onBack={handleBack}
        />

        <KPISection
          title="Target Statistics"
          gridCols={{ desktop: 6, mobile: 2, tablet: 3 }}
          items={[
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
          ]}
        />

        <OutreachCampaignAddTargets
          campaignType={campaign.campaignType}
          urlInput={urlInput}
          isAddingUrls={isAddingUrls}
          onUrlInputChange={setUrlInput}
          onAddUrls={handleAddUrls}
          onAddDmRecipients={handleAddDmRecipients}
        />

        <OutreachCampaignTargetsTable
          campaignType={campaign.campaignType}
          targets={targets}
          isRefreshing={isRefreshing}
        />
      </div>
    </Container>
  );
}
