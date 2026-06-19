'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useFastlaneEnabled } from '@hooks/data/organization/use-fastlane-enabled/use-fastlane-enabled';
import { useCallback, useMemo, useState } from 'react';
import FastlaneBlitz from './components/FastlaneBlitz';
import FastlaneBrandGate from './components/FastlaneBrandGate';
import FastlaneIdeaSelector from './components/FastlaneIdeaSelector';
import FastlaneSchedulePanel from './components/FastlaneSchedulePanel';
import { useFastlaneGeneration } from './hooks/useFastlaneGeneration';
import { useFastlaneIdeas } from './hooks/useFastlaneIdeas';
import { useFastlaneSchedule } from './hooks/useFastlaneSchedule';
import type {
  FastlaneFormat,
  FastlaneStep,
  ScheduleApprovedParams,
} from './types';
import { isBrandReadyForFastlane } from './utils/brand-readiness';

const STEPS: { id: FastlaneStep; label: string }[] = [
  { id: 'ideas', label: '1. Ideas' },
  { id: 'review', label: '2. Review' },
  { id: 'schedule', label: '3. Schedule' },
];

export default function FastlaneLayout() {
  const { isEnabled, isLoading: isFastlaneLoading } = useFastlaneEnabled();
  const { brandId, selectedBrand, credentials, isReady } = useBrand();

  const [step, setStep] = useState<FastlaneStep>('ideas');
  const [selectedFormats, setSelectedFormats] = useState<FastlaneFormat[]>([
    'image',
    'video',
  ]);

  // Derive brand readiness — recomputed whenever selectedFormats changes
  const readiness = useMemo(
    () => isBrandReadyForFastlane(selectedBrand, credentials, selectedFormats),
    [selectedBrand, credentials, selectedFormats],
  );

  const isAvatarConfigured =
    Boolean(selectedBrand?.agentConfig?.defaultAvatarIngredientId) ||
    Boolean(selectedBrand?.agentConfig?.defaultAvatarPhotoUrl);

  const avatarIngredientId =
    selectedBrand?.agentConfig?.defaultAvatarIngredientId ?? null;
  const voiceId = selectedBrand?.agentConfig?.defaultVoiceId ?? null;

  // Extract reference IDs from the brand
  const references = useMemo(
    () => selectedBrand?.references?.map((r: { id: string }) => r.id) ?? [],
    [selectedBrand?.references],
  );

  const {
    ideas,
    isLoading: isIdeasLoading,
    error,
    generateIdeas,
    reset,
  } = useFastlaneIdeas(brandId);

  const { assets, isGenerating, startGeneration, failedCount } =
    useFastlaneGeneration({ brandId, avatarIngredientId, voiceId, references });

  const { isScheduling, scheduleApproved } = useFastlaneSchedule();

  const handleGenerate = useCallback(
    async (formats: FastlaneFormat[], count: number, angle?: string) => {
      setSelectedFormats(formats);
      await generateIdeas(formats, count, angle);
    },
    [generateIdeas],
  );

  const handleStartGeneration = useCallback(async () => {
    setStep('review');
    await startGeneration(ideas);
  }, [ideas, startGeneration]);

  const handleApprove = useCallback((ideaId: string) => {
    // Update the asset's status — generation hook owns asset state; blitz
    // calls back to parent so layout can drive the state update.
    // We surface this via the generation hook's setAssets (not exposed), so
    // we track approved/rejected via a separate local map here.
    // DESIGN CHOICE: useFastlaneGeneration owns the asset list including status;
    // to keep it as single source of truth, we proxy approve/reject back into it
    // via startGeneration's returned mutators. However, since the generation hook
    // doesn't expose setAssets directly, we achieve this by re-reading the assets
    // array and identifying which got approved. The Blitz component calls onApprove
    // so we need to apply the status update.
    //
    // Since the hook's update function is internal, we replicate the mutation here
    // by rebuilding the asset list. The generation hook provides `assets` as state —
    // to mutate it from outside we need to either lift the state or expose a mutator.
    //
    // IMPLEMENTATION: We'll lift approval/rejection state to this layout component
    // as a separate overlay, applied when rendering.
    setApprovalMap((prev) => ({ ...prev, [ideaId]: 'approved' }));
  }, []);

  const handleReject = useCallback((ideaId: string) => {
    setApprovalMap((prev) => ({ ...prev, [ideaId]: 'rejected' }));
  }, []);

  const [approvalMap, setApprovalMap] = useState<
    Record<string, 'approved' | 'rejected'>
  >({});

  // Merge approval status into assets for display / scheduling
  const enrichedAssets = useMemo(
    () =>
      assets.map((a) => {
        const override = approvalMap[a.idea.id];
        return override ? { ...a, status: override } : a;
      }),
    [assets, approvalMap],
  );

  const handleSchedule = useCallback(
    (params: ScheduleApprovedParams) => {
      void scheduleApproved(params);
    },
    [scheduleApproved],
  );

  // ─────────────────────────────────────────────────────────
  // Guard: Fastlane feature flag
  // ─────────────────────────────────────────────────────────
  if (isFastlaneLoading || !isReady) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="gen-dot gen-dot-processing" />
      </div>
    );
  }

  if (!isEnabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <h2 className="gen-heading-lg">Fastlane is not available</h2>
        <p className="text-sm text-muted-foreground">
          Contact your organization admin to enable Fastlane.
        </p>
      </div>
    );
  }

  return (
    <FastlaneBrandGate readiness={readiness}>
      <div className="flex flex-col gap-8">
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <span
                className={
                  step === s.id
                    ? 'gen-label text-foreground'
                    : 'gen-label-sm text-muted-foreground'
                }
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <span className="gen-divider-vertical h-4 mx-1" />
              )}
            </div>
          ))}
        </div>

        <div className="gen-divider" />

        {/* Step content */}
        {step === 'ideas' && (
          <FastlaneIdeaSelector
            isAvatarConfigured={isAvatarConfigured}
            isLoading={isIdeasLoading}
            ideas={ideas}
            error={error}
            onGenerate={handleGenerate}
            onStartGeneration={handleStartGeneration}
          />
        )}

        {step === 'review' && (
          <FastlaneBlitz
            assets={enrichedAssets}
            failedCount={failedCount}
            isGenerating={isGenerating}
            onApprove={handleApprove}
            onReject={handleReject}
            onDone={() => setStep('schedule')}
          />
        )}

        {step === 'schedule' && (
          <FastlaneSchedulePanel
            assets={enrichedAssets}
            credentials={credentials}
            isScheduling={isScheduling}
            timezone={Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'}
            onSchedule={handleSchedule}
          />
        )}
      </div>
    </FastlaneBrandGate>
  );
}
