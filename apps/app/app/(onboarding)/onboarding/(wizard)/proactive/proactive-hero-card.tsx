'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import type { ProactiveWorkspaceResponse } from '@services/onboarding/onboarding.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import { HiArrowPath, HiSparkles } from 'react-icons/hi2';

type Props = {
  workspace: ProactiveWorkspaceResponse;
  statusLabel: string;
  isRefreshing: boolean;
  onConfigureProviders: () => void;
  onContinueSelfServe: () => void;
};

export default function ProactiveHeroCard({
  workspace,
  statusLabel,
  isRefreshing,
  onConfigureProviders,
  onContinueSelfServe,
}: Props) {
  return (
    <Card bodyClassName="gap-0 p-8" className="border-white/10 bg-white/[0.06]">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-2xl">
          <Badge
            className="px-4 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-white/55"
            variant="ghost"
          >
            <HiSparkles className="size-3" />
            Prepared Before You Arrived
          </Badge>
          <h1 className="mt-5 text-4xl font-semibold leading-none tracking-tight text-white md:text-5xl">
            {workspace.organization?.label || 'Your workspace'} is ready.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/55">
            {workspace.summary}
          </p>
        </div>

        <InsetSurface className="min-w-[220px]" tone="contrast">
          <div className="flex items-center justify-between text-sm text-white/50">
            <span>Readiness</span>
            <span>{statusLabel}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white transition-all duration-500"
              style={{ width: `${Math.max(workspace.prepPercent, 8)}%` }}
            />
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-white/40">
            <HiArrowPath
              className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            {workspace.prepStage.replaceAll('_', ' ')}
          </div>
        </InsetSurface>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          label="Configure providers"
          onClick={onConfigureProviders}
        />
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          label="Book a call"
          onClick={() => {
            window.location.href = EnvironmentService.calendly;
          }}
        />
        <Button
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          label="Continue self-serve"
          onClick={onContinueSelfServe}
        />
      </div>
    </Card>
  );
}
