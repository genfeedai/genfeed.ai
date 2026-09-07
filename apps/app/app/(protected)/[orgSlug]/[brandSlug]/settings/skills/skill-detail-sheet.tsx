import type { SkillDetailSheetProps } from '@props/settings/skills.props';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import { useTranslations } from 'next-intl';
import SkillDetailCard from './SkillDetailCard';

export default function SkillDetailSheet({
  customizing,
  isOpen,
  onCustomize,
  onOpenChange,
  onOpenTestInChat,
  onSaveSkill,
  onSkillDraftChange,
  savingSkill,
  selectedSkill,
  skillDraft,
}: SkillDetailSheetProps) {
  const translate = useTranslations('common.settings.skills');

  return (
    <Sheet onOpenChange={onOpenChange} open={isOpen}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{selectedSkill?.name ?? translate('heading')}</SheetTitle>
        </SheetHeader>
        <SkillDetailCard
          customizing={customizing}
          onCustomize={onCustomize}
          onOpenTestInChat={onOpenTestInChat}
          onSaveSkill={onSaveSkill}
          onSkillDraftChange={onSkillDraftChange}
          savingSkill={savingSkill}
          selectedSkill={selectedSkill}
          skillDraft={skillDraft}
        />
      </SheetContent>
    </Sheet>
  );
}
