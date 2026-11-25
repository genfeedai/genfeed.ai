'use client';

import { ContextSidebarPanel } from '@contexts/ui/context-sidebar-context';
import { ButtonSize, ButtonVariant, SkillRunsOn } from '@genfeedai/contracts';
import { resolveSkillRunsOn } from '@genfeedai/helpers';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import { Alert } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { MessageSquare, Monitor, Terminal } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useIsAppAvailable } from '@/components/shell/use-available-rail-apps';
import type { SkillDetailPanelProps } from '@/features/settings/props/skills.props';
import { useIsDesktopClient } from '@/hooks/ui/use-is-desktop-client/use-is-desktop-client';
import { DESKTOP_PAGE_URL } from '@/lib/navigation/desktop-links';
import SkillDetailCard from './SkillDetailCard';
import SkillRunsOnBadge from './skill-runs-on-badge';
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
  onRunInTerminal,
  onSaveSkill,
  onSkillDraftChange,
  savingSkill,
  selectedSkill,
  skillDraft,
  versions,
}: SkillDetailPanelProps) {
  const translate = useTranslations('common.settings.skills');
  const isAgentAvailable = useIsAppAvailable('agent');
  const isDesktopClient = useIsDesktopClient();
  const isDesktopSkill =
    selectedSkill !== null &&
    resolveSkillRunsOn(selectedSkill) === SkillRunsOn.DESKTOP;

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
                <Badge variant="secondary">
                  {translate('detail.version', {
                    version: selectedSkill.version,
                  })}
                </Badge>
              ) : null}
              <SkillRunsOnBadge skill={selectedSkill} />
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
            {isDesktopSkill && isDesktopClient && onRunInTerminal ? (
              <Button
                data-testid="skill-run-in-terminal"
                disabled={savingSkill || customizing}
                icon={<Terminal className="size-4" />}
                label={translate('actions.runInTerminal')}
                onClick={onRunInTerminal}
                variant={ButtonVariant.DEFAULT}
              />
            ) : null}
            {isDesktopSkill && !isDesktopClient ? (
              <Button
                asChild
                data-testid="skill-get-desktop"
                size={ButtonSize.DEFAULT}
                variant={ButtonVariant.DEFAULT}
                withWrapper={false}
              >
                <Link
                  href={DESKTOP_PAGE_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Monitor className="size-4" />
                  {translate('actions.getDesktop')}
                </Link>
              </Button>
            ) : null}
            {isAgentAvailable && !isDesktopSkill ? (
              <Button
                icon={<MessageSquare className="size-4" />}
                label={translate('actions.openSamplePrompt')}
                disabled={savingSkill || customizing}
                onClick={onOpenSamplePrompt}
                variant={ButtonVariant.SECONDARY}
              />
            ) : null}
          </div>
          {error ? <Alert variant="destructive">{error}</Alert> : null}
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
