'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { Skill } from '@services/content/skills.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { HiOutlineBeaker, HiOutlineSparkles } from 'react-icons/hi2';

type SkillDraft = {
  defaultInstructions: string;
  description: string;
  name: string;
  systemPromptTemplate: string;
};

type Props = {
  customizing: boolean;
  onCustomize: () => void;
  onOpenTestInChat: () => void;
  onSaveSkill: () => void;
  onSkillDraftChange: (updater: (current: SkillDraft) => SkillDraft) => void;
  savingSkill: boolean;
  selectedSkill: Skill | null;
  skillDraft: SkillDraft;
};

export default function SkillDetailCard({
  customizing,
  onCustomize,
  onOpenTestInChat,
  onSaveSkill,
  onSkillDraftChange,
  savingSkill,
  selectedSkill,
  skillDraft,
}: Props) {
  return (
    <Card
      bodyClassName="gap-0 p-5"
      className="rounded-3xl border-white/10 bg-black/20"
    >
      {selectedSkill ? (
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">
                {selectedSkill.name}
              </h2>
              <Badge
                className="px-2 py-1 text-[11px] uppercase tracking-[0.14em]"
                variant="outline"
              >
                {selectedSkill.slug}
              </Badge>
            </div>
            <p className="text-sm text-foreground/60">
              {selectedSkill.description}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <InsetSurface>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/45">
                Coverage
              </p>
              <p className="text-sm text-foreground/65">
                {selectedSkill.modalities.join(', ')} across{' '}
                {selectedSkill.channels.join(', ') || 'general channels'}.
              </p>
            </InsetSurface>
            <InsetSurface>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/45">
                Stage
              </p>
              <p className="text-sm text-foreground/65">
                Designed for the {selectedSkill.workflowStage} step of the
                content workflow.
              </p>
            </InsetSurface>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              className="rounded-full"
              onClick={onOpenTestInChat}
              variant={ButtonVariant.OUTLINE}
            >
              <HiOutlineBeaker className="size-4" />
              Test in chat
            </Button>
          </div>

          <InsetSurface className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Skill definition
                </p>
                <p className="text-sm text-foreground/55">
                  Built-in and imported skills can be customized into an
                  editable org variant. Org-owned variants can be edited here
                  directly.
                </p>
              </div>
              {!selectedSkill.organization ? (
                <Button
                  className="rounded-full"
                  disabled={customizing}
                  onClick={onCustomize}
                  variant={ButtonVariant.OUTLINE}
                >
                  <HiOutlineSparkles className="size-4" />
                  {customizing ? 'Customizing…' : 'Customize'}
                </Button>
              ) : null}
            </div>

            <span className="grid gap-2 text-sm text-foreground/70">
              Name
              <Input
                className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-foreground outline-none"
                disabled={!selectedSkill.organization}
                onChange={(event) =>
                  onSkillDraftChange((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                value={skillDraft.name}
              />
            </span>

            <span className="grid gap-2 text-sm text-foreground/70">
              Description
              <Textarea
                className="min-h-24 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-foreground outline-none"
                disabled={!selectedSkill.organization}
                onChange={(event) =>
                  onSkillDraftChange((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                value={skillDraft.description}
              />
            </span>

            <span className="grid gap-2 text-sm text-foreground/70">
              Default instructions
              <Textarea
                className="min-h-28 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-mono text-foreground outline-none"
                disabled={!selectedSkill.organization}
                onChange={(event) =>
                  onSkillDraftChange((current) => ({
                    ...current,
                    defaultInstructions: event.target.value,
                  }))
                }
                value={skillDraft.defaultInstructions}
              />
            </span>

            <Collapsible>
              <CollapsibleTrigger className="text-sm font-medium text-foreground/50 hover:text-foreground/70">
                Advanced: System Prompt Template
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2">
                  <p className="text-xs text-foreground/40">
                    The exact text injected into the agent system prompt at
                    runtime. Falls back to Default Instructions if empty.
                  </p>
                  <Textarea
                    className="min-h-32 w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-mono text-foreground outline-none"
                    disabled={!selectedSkill.organization}
                    onChange={(event) =>
                      onSkillDraftChange((current) => ({
                        ...current,
                        systemPromptTemplate: event.target.value,
                      }))
                    }
                    placeholder="Leave empty to use Default Instructions above"
                    value={skillDraft.systemPromptTemplate}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {selectedSkill.organization ? (
              <Button
                disabled={savingSkill}
                onClick={onSaveSkill}
                variant={ButtonVariant.DEFAULT}
              >
                {savingSkill ? 'Saving…' : 'Save variant'}
              </Button>
            ) : null}
          </InsetSurface>
        </div>
      ) : (
        <InsetSurface className="text-sm text-foreground/55">
          Select a skill from the catalog to inspect its detail.
        </InsetSurface>
      )}
    </Card>
  );
}
