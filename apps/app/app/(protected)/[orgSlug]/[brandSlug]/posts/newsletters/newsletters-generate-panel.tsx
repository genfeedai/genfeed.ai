import { ButtonVariant } from '@genfeedai/enums';
import type { Newsletter } from '@models/content/newsletter.model';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import Textarea from '@ui/inputs/textarea/Textarea';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { HiSparkles } from 'react-icons/hi2';

type TopicProposal = {
  angle: string;
  reason: string;
  title: string;
};

type Props = {
  instructions: string;
  isGeneratingDraft: boolean;
  isGeneratingTopics: boolean;
  manualAngle: string;
  manualTopic: string;
  proposals: TopicProposal[];
  publishedNewsletters: Newsletter[];
  selectedContextSet: Set<string>;
  selectedProposal: TopicProposal | null;
  onGenerateDraft: () => void;
  onGenerateTopics: () => void;
  onInstructionsChange: (value: string) => void;
  onManualAngleChange: (value: string) => void;
  onManualTopicChange: (value: string) => void;
  onSelectProposal: (proposal: TopicProposal) => void;
  onToggleContext: (id: string, checked: boolean) => void;
};

export default function NewsletterGeneratePanel({
  instructions,
  isGeneratingDraft,
  isGeneratingTopics,
  manualAngle,
  manualTopic,
  proposals,
  publishedNewsletters,
  selectedContextSet,
  selectedProposal,
  onGenerateDraft,
  onGenerateTopics,
  onInstructionsChange,
  onManualAngleChange,
  onManualTopicChange,
  onSelectProposal,
  onToggleContext,
}: Props) {
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Generate next issue</h2>
          <p className="text-sm text-muted-foreground">
            Start from AI proposals or set a manual topic, then choose which
            recent issues the draft should remember.
          </p>
        </div>
        <Button
          label="Generate Proposals"
          variant={ButtonVariant.SOFT}
          icon={<HiSparkles />}
          isLoading={isGeneratingTopics}
          onClick={onGenerateTopics}
        />
      </div>

      <Textarea
        label="Editorial instructions"
        rows={4}
        placeholder="Audience framing, structure preferences, exclusions, or tone guidance..."
        value={instructions}
        onChange={(event) => onInstructionsChange(event.target.value)}
      />

      <div className="space-y-3">
        <div className="text-sm font-medium text-foreground">
          AI topic proposals
        </div>
        {proposals.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Generate proposals to get issue angles grounded in brand context and
            recent published newsletters.
          </div>
        ) : (
          <div className="grid gap-3">
            {proposals.map((proposal) => {
              const isSelected =
                selectedProposal?.title === proposal.title &&
                selectedProposal?.angle === proposal.angle;

              return (
                <Button
                  key={`${proposal.title}-${proposal.angle}`}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                  onClick={() => onSelectProposal(proposal)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-foreground">
                      {proposal.title}
                    </div>
                    {isSelected ? (
                      <Badge status="active">Selected</Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 text-sm text-foreground/90">
                    {proposal.angle}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {proposal.reason}
                  </div>
                </Button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            Manual topic
          </span>
          <Input
            placeholder="Enter a topic to bypass proposals"
            value={manualTopic}
            onChange={(event) => onManualTopicChange(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            Manual angle
          </span>
          <Input
            placeholder="Optional framing"
            value={manualAngle}
            onChange={(event) => onManualAngleChange(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-medium text-foreground">
          Prior newsletters in memory
        </div>
        {publishedNewsletters.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No published newsletters yet. The first issue will rely on brand
            memory, instructions, and any current sources.
          </div>
        ) : (
          <div className="grid gap-2">
            {publishedNewsletters.map((newsletter) => (
              <span
                key={newsletter.id}
                className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm"
              >
                <Checkbox
                  checked={selectedContextSet.has(newsletter.id)}
                  onCheckedChange={(value) => {
                    onToggleContext(newsletter.id, Boolean(value));
                  }}
                />
                <span className="space-y-1">
                  <span className="block font-medium text-foreground">
                    {newsletter.label}
                  </span>
                  <span className="block text-muted-foreground">
                    {newsletter.topic}
                  </span>
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      <Button
        label="Generate Review Draft"
        variant={ButtonVariant.SOFT}
        isLoading={isGeneratingDraft}
        onClick={onGenerateDraft}
      />
    </Card>
  );
}
