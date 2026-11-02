'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import PromptEmptyState from '@ui/layout/prompt-empty-state/PromptEmptyState';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import OrganizationModulePreferenceGate from '@/components/guards/organization-module/OrganizationModulePreferenceGate';
import { useMotionComposer } from '@/features/motion/hooks/use-motion-composer';
import MotionComposer from './MotionComposer';
import MotionPromptCards from './MotionPromptCards';

/**
 * The left side of the Motion workspace: a centered prompt with starter cards
 * and the prompt bar. The bar asks for a quote first; only after the creator
 * approves its credit ceiling is a project created and opened.
 */
export default function MotionNewPane(): ReactElement {
  const { orgId, userId, sessionId } = useAuthIdentity();
  const { selectedBrand } = useBrand();
  // A different actor or brand starts from an empty form and no quote.
  return (
    <MotionNewPaneBody
      key={JSON.stringify([orgId, userId, sessionId, selectedBrand?.id])}
    />
  );
}

function MotionNewPaneBody(): ReactElement {
  const t = useTranslations('pages.studioMotion');
  const controller = useMotionComposer({});

  return (
    <OrganizationModulePreferenceGate moduleId="motion">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <PromptEmptyState
          description={t('heroDescription')}
          title={t('heroTitle')}
        >
          <MotionPromptCards
            isDisabled={controller.isBusy}
            onSelect={controller.applyPreset}
          />
        </PromptEmptyState>
        <div className="mt-auto shrink-0 px-3 pb-3">
          <MotionComposer controller={controller} />
        </div>
      </div>
    </OrganizationModulePreferenceGate>
  );
}
