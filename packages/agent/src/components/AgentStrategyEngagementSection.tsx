import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import type { ReactElement } from 'react';

const TONE_OPTIONS = [
  'friendly',
  'professional',
  'witty',
  'supportive',
  'informative',
];

type Props = {
  isEngagementOpen: boolean;
  setIsEngagementOpen: (value: boolean) => void;
  isEngagementEnabled: boolean;
  setIsEngagementEnabled: (value: boolean) => void;
  keywordInput: string;
  setKeywordInput: (value: string) => void;
  handleAddKeyword: () => void;
  handleRemoveKeyword: (keyword: string) => void;
  engagementKeywords: string[];
  engagementTone: string;
  setEngagementTone: (value: string) => void;
  maxEngagementsPerDay: number;
  setMaxEngagementsPerDay: (value: number) => void;
};

export function AgentStrategyEngagementSection({
  isEngagementOpen,
  setIsEngagementOpen,
  isEngagementEnabled,
  setIsEngagementEnabled,
  keywordInput,
  setKeywordInput,
  handleAddKeyword,
  handleRemoveKeyword,
  engagementKeywords,
  engagementTone,
  setEngagementTone,
  maxEngagementsPerDay,
  setMaxEngagementsPerDay,
}: Props): ReactElement {
  return (
    <section className="border border-border">
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={() => setIsEngagementOpen(!isEngagementOpen)}
        className="flex w-full items-center justify-between p-4"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Engagement
        </h3>
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-muted-foreground transition-transform ${
            isEngagementOpen ? 'rotate-180' : ''
          }`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </Button>

      {isEngagementOpen && (
        <div className="space-y-4 border-t border-border px-4 pb-4 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">
              Enable Engagement
            </span>
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => setIsEngagementEnabled(!isEngagementEnabled)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                isEngagementEnabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`pointer-events-none inline-block size-4 rounded-full bg-background shadow-sm transition-transform ${
                  isEngagementEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </Button>
          </div>

          {isEngagementEnabled && (
            <>
              <div className="space-y-1">
                <label
                  htmlFor="strategy-keyword-input"
                  className="text-xs font-medium text-foreground"
                >
                  Keywords
                </label>
                <div className="flex gap-2">
                  <Input
                    id="strategy-keyword-input"
                    type="text"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddKeyword();
                      }
                    }}
                    placeholder="Add a keyword..."
                    className="flex-1"
                  />
                  <Button
                    variant={ButtonVariant.DEFAULT}
                    size={ButtonSize.SM}
                    onClick={handleAddKeyword}
                  >
                    Add
                  </Button>
                </div>
                {engagementKeywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {engagementKeywords.map((keyword) => (
                      <span
                        key={keyword}
                        className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs text-foreground"
                      >
                        {keyword}
                        <Button
                          variant={ButtonVariant.GHOST}
                          size={ButtonSize.XS}
                          onClick={() => handleRemoveKeyword(keyword)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          x
                        </Button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="strategy-tone"
                    className="text-xs font-medium text-foreground"
                  >
                    Tone
                  </label>
                  <Select
                    value={engagementTone}
                    onValueChange={setEngagementTone}
                  >
                    <SelectTrigger id="strategy-tone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map((tone) => (
                        <SelectItem key={tone} value={tone}>
                          {tone.charAt(0).toUpperCase() + tone.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="strategy-max-per-day"
                    className="text-xs font-medium text-foreground"
                  >
                    Max / Day
                  </label>
                  <Input
                    id="strategy-max-per-day"
                    type="number"
                    value={maxEngagementsPerDay}
                    onChange={(e) =>
                      setMaxEngagementsPerDay(Number(e.target.value))
                    }
                    min={0}
                    max={100}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
