'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import CreativeAppNewPane from '@ui/layout/creative-app-new-pane/CreativeAppNewPane';
import ProjectChoicePrompt from '@ui/layout/project-choice-prompt/ProjectChoicePrompt';
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
      <CreativeAppNewPane
        body={
          controller.projectChoice ? (
            <ProjectChoicePrompt
              isDisabled={controller.isBusy}
              newProjectLabel={t('projectChoiceNew')}
              onChoose={controller.chooseProject}
              onCreateNew={controller.createNewProject}
              projects={controller.projects}
              question={t('projectChoiceQuestion')}
              request={controller.projectChoice}
            />
          ) : undefined
        }
        description={t('heroDescription')}
        promptBar={<MotionComposer controller={controller} />}
        title={t('heroTitle')}
      >
        <MotionPromptCards
          isDisabled={controller.isBusy}
          onSelect={controller.applyPreset}
        />
      </CreativeAppNewPane>
    </OrganizationModulePreferenceGate>
  );
}
