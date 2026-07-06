'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button as PrimitiveButton } from '@ui/primitives/button';
import Link from 'next/link';
import {
  HiOutlineRectangleGroup,
  HiOutlineUserGroup,
  HiOutlineViewColumns,
  HiPlus,
} from 'react-icons/hi2';
import ContentTeamCampaignsSection from './ContentTeamCampaignsSection';
import ContentTeamMemberCard from './ContentTeamMemberCard';
import ContentTeamSummaryCard from './ContentTeamSummaryCard';
import { useContentTeamPage } from './useContentTeamPage';

export default function ContentTeamPage() {
  const {
    strategies,
    isStrategiesLoading,
    campaigns,
    isCampaignsLoading,
    strategiesById,
    groupedStrategies,
    hqCards,
    automationCards,
    handleToggle,
    handleRunNow,
  } = useContentTeamPage();

  return (
    <Container
      description="Operate specialist content agents, orchestrated campaigns, and repeatable automations from one role-first control plane."
      icon={HiOutlineViewColumns}
      label="Content Team"
      right={
        <div className="flex flex-wrap gap-2">
          <PrimitiveButton
            asChild
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
          >
            <Link href={APP_ROUTES.ORCHESTRATION.HIRE}>
              <HiPlus /> Hire Agent
            </Link>
          </PrimitiveButton>
          <PrimitiveButton
            asChild
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
          >
            <Link href={APP_ROUTES.ORCHESTRATION.ORCHESTRATOR}>
              <HiOutlineRectangleGroup /> Launch Orchestrator
            </Link>
          </PrimitiveButton>
        </div>
      }
    >
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            HQ
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            Mission, review load, calendar pressure, run health, and budget
            burn.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {hqCards.map((card) => (
            <ContentTeamSummaryCard key={card.label} {...card} />
          ))}
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
              Team
            </h2>
            <p className="mt-1 text-sm text-foreground/60">
              Hire and manage role-specific agents grouped by function.
            </p>
          </div>
          <PrimitiveButton
            asChild
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
          >
            <Link href={APP_ROUTES.ORCHESTRATION.HIRE}>Hire Agent</Link>
          </PrimitiveButton>
        </div>

        {isStrategiesLoading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {['strategy-skeleton-1', 'strategy-skeleton-2'].map(
              (skeletonId) => (
                <div
                  key={skeletonId}
                  className="h-56 animate-pulse rounded-[1.25rem] border border-white/[0.08] bg-white/[0.04]"
                />
              ),
            )}
          </div>
        ) : strategies.length === 0 ? (
          <Card
            bodyClassName="flex flex-col items-start gap-4 p-6"
            description="Use the hire flow to spin up specialist agents for short-form, X, image, script, and avatar work."
            icon={HiOutlineUserGroup}
            iconWrapperClassName="bg-tertiary text-muted-foreground"
            label="No team members yet"
          >
            <PrimitiveButton
              asChild
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
            >
              <Link href={APP_ROUTES.ORCHESTRATION.HIRE}>
                Hire Your First Agent
              </Link>
            </PrimitiveButton>
          </Card>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedStrategies).map(
              ([groupLabel, groupStrategies]) => (
                <div key={groupLabel} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                      {groupLabel}
                    </span>
                    <p className="text-sm text-foreground/50">
                      {groupStrategies.length} specialist
                      {groupStrategies.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {groupStrategies.map((strategy) => (
                      <ContentTeamMemberCard
                        key={strategy.id}
                        onRunNow={handleRunNow}
                        onToggle={handleToggle}
                        strategy={strategy}
                      />
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <ContentTeamCampaignsSection
        campaigns={campaigns}
        isCampaignsLoading={isCampaignsLoading}
        strategiesById={strategiesById}
      />

      <section className="mt-10 space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            Automations
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            Fixed workflows stay separate from adaptive campaigns and power
            repeatable pipelines.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {automationCards.map((card) => (
            <ContentTeamSummaryCard key={card.label} {...card} />
          ))}
        </div>
      </section>
    </Container>
  );
}
