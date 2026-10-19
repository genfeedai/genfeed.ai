'use client';

import { ContextSidebarPanel } from '@contexts/ui/context-sidebar-context';
import { ButtonVariant } from '@genfeedai/contracts';
import type { SkillDetailPanelProps } from '@props/settings/skills.props';
import Badge from '@ui/display/badge/Badge';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import { Button } from '@ui/primitives/button';
import { MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import SkillDetailCard from './SkillDetailCard';
import SkillVersionsPanel from './skill-versions-panel';

/**
 * The selected skill's detail in the right context sidebar. Nothing is
 * rendered while no skill is selected.
 */
export default function SkillDetailPanel({
  customizing,
  draftErrors,
  error,
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
  versions,
}: SkillDetailPanelProps) {
  const translate = useTranslations('common.settings.skills');

  return (
    <ContextSidebarPanel
      onClose={onClose}
      selection={
        selectedSkill
          ? {
              id: selectedSkill.id,
              kind: 'skill',
              origin: 'user',
              subtitle: selectedSkill.description,
              title: selectedSkill.name,
            }
          : null
      }
    >
      {selectedSkill ? (
        <TableRowSummary
          badges={
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
          }
        >
          <div className="flex flex-wrap gap-2">
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
          </div>
          {error ? (
            <div
              role="alert"
              className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}
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
          {selectedSkill.canRead === true && versions ? (
            <SkillVersionsPanel {...versions} />
          ) : null}
        </TableRowSummary>
      ) : null}
    </ContextSidebarPanel>
  );
}
