import { ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import type { SkillDetailSheetProps } from '@props/settings/skills.props';
import Badge from '@ui/display/badge/Badge';
import EntityOverlayShell from '@ui/overlays/entity/EntityOverlayShell';
import { Button } from '@ui/primitives/button';
import { FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import SkillDetailCard from './SkillDetailCard';

export default function SkillDetailSheet({
  customizing,
  onClose,
  onCustomize,
  onOpenTestInChat,
  onSaveSkill,
  onSkillDraftChange,
  savingSkill,
  selectedSkill,
  skillDraft,
}: SkillDetailSheetProps) {
  const translate = useTranslations('common.settings.skills');

  return (
    <EntityOverlayShell
      actions={
        selectedSkill ? (
          <Button
            icon={<FlaskConical className="size-4" />}
            label={translate('actions.testWithAgent')}
            onClick={onOpenTestInChat}
            variant={ButtonVariant.SECONDARY}
          />
        ) : null
      }
      badges={
        selectedSkill ? (
          <>
            <Badge variant="outline">{selectedSkill.slug}</Badge>
            {selectedSkill.version ? (
              <Badge variant="ghost">
                {translate('detail.version', {
                  version: selectedSkill.version,
                })}
              </Badge>
            ) : null}
          </>
        ) : null
      }
      description={selectedSkill?.description}
      id={ModalEnum.SKILL}
      onClose={onClose}
      surface="flat"
      title={selectedSkill?.name ?? translate('heading')}
      width="lg"
    >
      <SkillDetailCard
        customizing={customizing}
        onCustomize={onCustomize}
        onSaveSkill={onSaveSkill}
        onSkillDraftChange={onSkillDraftChange}
        savingSkill={savingSkill}
        selectedSkill={selectedSkill}
        skillDraft={skillDraft}
      />
    </EntityOverlayShell>
  );
}
