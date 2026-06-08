import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import type { ReactElement } from 'react';

const PLATFORM_OPTIONS = [
  'instagram',
  'twitter',
  'linkedin',
  'tiktok',
  'facebook',
  'youtube',
];

type Props = {
  label: string;
  setLabel: (value: string) => void;
  topicInput: string;
  setTopicInput: (value: string) => void;
  handleAddTopic: () => void;
  handleRemoveTopic: (topic: string) => void;
  topics: string[];
  voice: string;
  setVoice: (value: string) => void;
  platforms: string[];
  handleTogglePlatform: (platform: string) => void;
};

export function AgentStrategyContentSection({
  label,
  setLabel,
  topicInput,
  setTopicInput,
  handleAddTopic,
  handleRemoveTopic,
  topics,
  voice,
  setVoice,
  platforms,
  handleTogglePlatform,
}: Props): ReactElement {
  return (
    <section className="space-y-4 border border-border p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Content Strategy
      </h3>

      <div className="space-y-1">
        <label
          htmlFor="strategy-label"
          className="text-xs font-medium text-foreground"
        >
          Label
        </label>
        <Input
          id="strategy-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Weekly lifestyle content"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="strategy-topic-input"
          className="text-xs font-medium text-foreground"
        >
          Topics
        </label>
        <div className="flex gap-2">
          <Input
            id="strategy-topic-input"
            type="text"
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTopic();
              }
            }}
            placeholder="Add a topic..."
            className="flex-1"
          />
          <Button
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            onClick={handleAddTopic}
          >
            Add
          </Button>
        </div>
        {topics.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {topics.map((topic) => (
              <span
                key={topic}
                className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs text-foreground"
              >
                {topic}
                <Button
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.XS}
                  onClick={() => handleRemoveTopic(topic)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  x
                </Button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label
          htmlFor="strategy-voice"
          className="text-xs font-medium text-foreground"
        >
          Voice
        </label>
        <Textarea
          id="strategy-voice"
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          placeholder="Describe your brand voice..."
          rows={3}
        />
      </div>

      <div className="space-y-1">
        <span className="text-xs font-medium text-foreground">Platforms</span>
        <div className="flex flex-wrap gap-2">
          {PLATFORM_OPTIONS.map((platform) => (
            <Button
              key={platform}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => handleTogglePlatform(platform)}
              className={`border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                platforms.includes(platform)
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/30'
              }`}
            >
              {platform}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}
