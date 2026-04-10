'use client';

import { useAuth } from '@clerk/nextjs';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { EnvironmentService } from '@services/core/environment.service';
import {
  OnboardingService,
  type ProactiveWorkspaceResponse,
} from '@services/onboarding/onboarding.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Button } from '@ui/primitives/button';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  HiArrowPath,
  HiBriefcase,
  HiCheckCircle,
  HiSparkles,
} from 'react-icons/hi2';
import { toast } from 'sonner';

const POLL_INTERVAL_MS = 8000;

const LIVE_UPDATES = [
  {
    key: 'researching_brand',
    label: 'Refining your brand voice',
  },
  {
    key: 'generating_outputs',
    label: 'Generating more ideas',
  },
  {
    key: 'ready',
    label: 'Finding channel context',
  },
];

function getOutputTitle(post: IPost): string {
  return (
    post.label?.trim() || post.description?.trim() || `${post.platform} draft`
  );
}

export default function ProactiveContent() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [workspace, setWorkspace] = useState<ProactiveWorkspaceResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusLabel = useMemo(() => {
    if (!workspace) {
      return 'Preparing your workspace';
    }

    return `${workspace.prepPercent}% ready`;
  }, [workspace]);

  useEffect(() => {
    let isCancelled = false;

    const loadWorkspace = async (mode: 'claim' | 'refresh') => {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        return;
      }

      const service = OnboardingService.getInstance(token);

      try {
        const result =
          mode === 'claim'
            ? await service.claimProactiveWorkspace()
            : await service.getProactiveWorkspace();

        if (!isCancelled) {
          setWorkspace(result);
          setError(null);
        }
      } catch (loadError) {
        if (mode === 'claim') {
          try {
            const fallback = await service.getProactiveWorkspace();
            if (!isCancelled) {
              setWorkspace(fallback);
              setError(null);
            }
            return;
          } catch {
            // fall through to shared error path
          }
        }

        if (!isCancelled) {
          setError('We could not load your prepared workspace.');
          toast.error('Unable to load proactive onboarding.');
        }
        throw loadError;
      }
    };

    void loadWorkspace('claim')
      .catch(() => undefined)
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    const intervalId = window.setInterval(() => {
      setIsRefreshing(true);
      void loadWorkspace('refresh')
        .catch(() => undefined)
        .finally(() => {
          if (!isCancelled) {
            setIsRefreshing(false);
          }
        });
    }, POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [getToken]);

  if (isLoading) {
    return <PageLoadingState />;
  }

  if (!workspace) {
    return (
      <div className="max-w-3xl">
        <Card
          bodyClassName="gap-0 p-8"
          className="rounded-3xl border-white/10 bg-white/[0.03]"
        >
          <p className="text-sm uppercase tracking-[0.24em] text-white/35">
            Proactive Onboarding
          </p>
          <h1 className="mt-4 text-4xl font-serif text-white">
            Your workspace is almost ready.
          </h1>
          <p className="mt-4 max-w-xl text-white/55">
            {error ?? 'Please refresh in a moment or use the fallback path.'}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              label="Continue self-serve"
              onClick={() => router.push('/onboarding/brand')}
            />
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              label="Book a call"
              onClick={() => {
                window.location.href = EnvironmentService.calendly;
              }}
            />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card
        bodyClassName="gap-0 p-8"
        className="rounded-3xl border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),rgba(255,255,255,0.03)_45%,rgba(0,0,0,0.2))]"
      >
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <Badge
              className="px-4 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-white/55"
              variant="ghost"
            >
              <HiSparkles className="h-3 w-3" />
              Prepared Before You Arrived
            </Badge>
            <h1 className="mt-5 text-4xl font-serif leading-none tracking-tight text-white md:text-5xl">
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
            onClick={() => router.push('/onboarding/providers')}
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
            onClick={() => router.push('/onboarding/brand')}
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <Card
          bodyClassName="gap-0 p-6"
          className="rounded-3xl border-white/10 bg-white/[0.03]"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-white/30">
                Starter Outputs
              </p>
              <h2 className="mt-2 text-2xl font-serif text-white">
                Drafts ready on first login
              </h2>
            </div>
            <div className="text-sm text-white/45">
              {workspace.outputs.length} prepared
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {workspace.outputs.length > 0 ? (
              workspace.outputs.map((post) => (
                <InsetSurface key={post.id} tone="contrast">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-medium text-white">
                      {getOutputTitle(post)}
                    </h3>
                    <Badge
                      className="px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/40"
                      variant="outline"
                    >
                      {post.platform}
                    </Badge>
                  </div>
                  {post.description && (
                    <p className="mt-3 line-clamp-3 text-sm text-white/55">
                      {post.description}
                    </p>
                  )}
                </InsetSurface>
              ))
            ) : (
              <InsetSurface
                className="border-dashed p-6 text-sm text-white/45"
                tone="contrast"
              >
                Draft outputs are still finalizing. You can continue straight to
                your prepared workspace and they will keep hydrating.
              </InsetSurface>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card
            bodyClassName="gap-0 p-6"
            className="rounded-3xl border-white/10 bg-white/[0.03]"
          >
            <p className="text-sm uppercase tracking-[0.24em] text-white/30">
              Workspace Context
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs text-white/35">Organization</p>
                <p className="mt-1 text-lg text-white">
                  {workspace.organization?.label || 'Prepared org'}
                </p>
              </div>
              <div>
                <p className="text-xs text-white/35">Brand</p>
                <p className="mt-1 text-lg text-white">
                  {workspace.brand?.name || 'Prepared brand'}
                </p>
              </div>
              {workspace.brand?.voiceTone && (
                <div>
                  <p className="text-xs text-white/35">Voice snapshot</p>
                  <p className="mt-1 text-sm text-white/55">
                    {workspace.brand.voiceTone}
                  </p>
                </div>
              )}
              {workspace.brand?.colors && workspace.brand.colors.length > 0 && (
                <div>
                  <p className="text-xs text-white/35">Brand colors</p>
                  <div className="mt-2 flex gap-2">
                    {workspace.brand.colors.map((color) => (
                      <div
                        key={color}
                        className="h-6 w-6 rounded-full border border-white/10"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card
            bodyClassName="gap-0 p-6"
            className="rounded-3xl border-white/10 bg-white/[0.03]"
          >
            <div className="flex items-center gap-2 text-white">
              <HiBriefcase className="h-4 w-4 text-white/45" />
              <h2 className="text-lg font-medium">Live refinement</h2>
            </div>
            <div className="mt-4 space-y-3">
              {LIVE_UPDATES.map((item) => {
                const isActive = workspace.prepStage === item.key;
                const isComplete =
                  workspace.prepStage === 'ready' && item.key !== 'ready';

                return (
                  <InsetSurface
                    key={item.key}
                    className="flex items-center gap-3 px-4 py-3"
                    density="compact"
                    tone="contrast"
                  >
                    <div className="flex h-5 w-5 items-center justify-center">
                      {isComplete ? (
                        <HiCheckCircle className="h-5 w-5 text-emerald-300" />
                      ) : (
                        <div
                          className={`h-3 w-3 rounded-full ${
                            isActive ? 'animate-pulse bg-white' : 'bg-white/20'
                          }`}
                        />
                      )}
                    </div>
                    <p className="text-sm text-white/60">{item.label}</p>
                  </InsetSurface>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
