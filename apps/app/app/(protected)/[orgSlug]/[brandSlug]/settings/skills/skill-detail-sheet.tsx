import { ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import type { SkillDetailSheetProps } from '@props/settings/skills.props';
import Badge from '@ui/display/badge/Badge';
import EntityOverlayShell from '@ui/overlays/entity/EntityOverlayShell';
import { Button } from '@ui/primitives/button';
import { MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import SkillDetailCard from './SkillDetailCard';

export default function SkillDetailSheet({
  customizing,
  draftErrors,
  hasChanges,
  isForkBlocked,
  onArchiveSkill,
  onClose,
  onCustomize,
  onExportSkill,
  onOpenSamplePrompt,
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
          <>
            {selectedSkill.canExport === true && onExportSkill ? (
              <Button
                label={translate('actions.export')}
                disabled={savingSkill || customizing}
                onClick={() => {
                  if (
                    selectedSkill.canExport === true &&
                    !savingSkill &&
                    !customizing
                  )
                    onExportSkill();
                }}
                variant={ButtonVariant.SECONDARY}
              />
            ) : null}
            {selectedSkill.canEdit === true && onArchiveSkill ? (
              <Button
                label={translate('actions.archive')}
                disabled={savingSkill || customizing}
                onClick={() => {
                  if (
                    selectedSkill.canEdit === true &&
                    !savingSkill &&
                    !customizing
                  )
                    onArchiveSkill();
                }}
                variant={ButtonVariant.SECONDARY}
              />
            ) : null}
            <Button
              icon={<MessageSquare className="size-4" />}
              label={translate('actions.openSamplePrompt')}
              disabled={savingSkill || customizing}
              onClick={onOpenSamplePrompt}
              variant={ButtonVariant.SECONDARY}
            />
          </>
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
        draftErrors={draftErrors}
        hasChanges={hasChanges}
        isForkBlocked={isForkBlocked}
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
