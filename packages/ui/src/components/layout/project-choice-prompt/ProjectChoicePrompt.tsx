import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardPadding,
  CardVariant,
} from '@genfeedai/contracts';
import type { ProjectChoicePromptProps } from '@genfeedai/props/ui/layout/project-choice-prompt.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';

/**
 * The agent's "which project?" turn in a creative app: the viewer's request,
 * the question, and one button per project. Shared by every creative app's
 * New screen so the ask reads the same in Turbo, Clipper, Motion, Editor and
 * Storyboard.
 */
export default function ProjectChoicePrompt({
  question,
  request,
  projects,
  newProjectLabel,
  isDisabled = false,
  onChoose,
  onCreateNew,
}: ProjectChoicePromptProps): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
      <Card
        className="ml-auto max-w-[85%]"
        gap={CardGap.NONE}
        padding={CardPadding.SM}
        variant={CardVariant.INSET}
      >
        <div className="break-words text-sm leading-6 text-foreground">
          {request}
        </div>
      </Card>
      <p className="max-w-[92%] text-sm leading-relaxed text-foreground/90">
        {question}
      </p>
      <div className="flex flex-wrap gap-2">
        {projects.map((project) => (
          <Button
            isDisabled={isDisabled}
            key={project.id}
            onClick={() => onChoose(project.id)}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            {project.title}
          </Button>
        ))}
        <Button
          isDisabled={isDisabled}
          onClick={onCreateNew}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
        >
          {newProjectLabel}
        </Button>
      </div>
    </div>
  );
}
