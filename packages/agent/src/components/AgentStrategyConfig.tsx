import type { AgentStrategy } from '@genfeedai/agent/models/agent-strategy.model';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import type { AgentStrategyApiService } from '@genfeedai/agent/services/agent-strategy-api.service';
import { useAgentStrategyStore } from '@genfeedai/agent/stores/agent-strategy.store';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

interface AgentStrategyConfigProps {
  apiService: AgentStrategyApiService;
}

const PLATFORM_OPTIONS = [
  'instagram',
  'twitter',
  'linkedin',
  'tiktok',
  'facebook',
  'youtube',
];

const RUN_FREQUENCY_OPTIONS = [
  { label: 'Every 6 hours', value: 'every_6_hours' },
  { label: 'Twice daily', value: 'twice_daily' },
  { label: 'Daily', value: 'daily' },
];

const TONE_OPTIONS = [
  'friendly',
  'professional',
  'witty',
  'supportive',
  'informative',
];

const TIMEZONE_OPTIONS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'UTC',
];

export function AgentStrategyConfig({
  apiService,
}: AgentStrategyConfigProps): ReactElement {
  const strategy = useAgentStrategyStore((s) => s.strategy);
  const setStrategy = useAgentStrategyStore((s) => s.setStrategy);
  const isLoading = useAgentStrategyStore((s) => s.isLoading);
  const setIsLoading = useAgentStrategyStore((s) => s.setIsLoading);
  const setError = useAgentStrategyStore((s) => s.setError);

  const [label, setLabel] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState('');
  const [voice, setVoice] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [postsPerWeek, setPostsPerWeek] = useState(10);
  const [runFrequency, setRunFrequency] = useState('daily');
  const [timezone, setTimezone] = useState('America/New_York');
  const [dailyCreditBudget, setDailyCreditBudget] = useState(100);
  const [weeklyCreditBudget, setWeeklyCreditBudget] = useState(500);
  const [isEngagementEnabled, setIsEngagementEnabled] = useState(false);
  const [engagementKeywords, setEngagementKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [engagementTone, setEngagementTone] = useState('friendly');
  const [maxEngagementsPerDay, setMaxEngagementsPerDay] = useState(20);
  const [isEngagementOpen, setIsEngagementOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const populateForm = useCallback((s: AgentStrategy) => {
    setLabel(s.label);
    setTopics(s.topics);
    setVoice(s.voice ?? '');
    setPlatforms(s.platforms);
    setPostsPerWeek(s.postsPerWeek);
    setRunFrequency(s.runFrequency);
    setTimezone(s.timezone);
    setDailyCreditBudget(s.dailyCreditBudget);
    setWeeklyCreditBudget(s.weeklyCreditBudget);
    setIsEngagementEnabled(s.isEngagementEnabled);
    setEngagementKeywords(s.engagementKeywords);
    setEngagementTone(s.engagementTone ?? 'friendly');
    setMaxEngagementsPerDay(s.maxEngagementsPerDay);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const fetchStrategy = async () => {
      setIsLoading(true);
      try {
        const strategies = await runAgentApiEffect(
          apiService.getStrategiesEffect(controller.signal),
        );
        if (strategies.length > 0) {
          setStrategy(strategies[0]);
          populateForm(strategies[0]);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(
          err instanceof Error ? err.message : 'Failed to load strategy',
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    fetchStrategy();
    return () => controller.abort();
  }, [apiService, setStrategy, setIsLoading, setError, populateForm]);

  const handleAddTopic = useCallback(() => {
    const trimmed = topicInput.trim();
    if (trimmed && !topics.includes(trimmed)) {
      setTopics((prev) => [...prev, trimmed]);
    }
    setTopicInput('');
  }, [topicInput, topics]);

  const handleRemoveTopic = useCallback((topic: string) => {
    setTopics((prev) => prev.filter((t) => t !== topic));
  }, []);

  const handleAddKeyword = useCallback(() => {
    const trimmed = keywordInput.trim();
    if (trimmed && !engagementKeywords.includes(trimmed)) {
      setEngagementKeywords((prev) => [...prev, trimmed]);
    }
    setKeywordInput('');
  }, [keywordInput, engagementKeywords]);

  const handleRemoveKeyword = useCallback((keyword: string) => {
    setEngagementKeywords((prev) => prev.filter((k) => k !== keyword));
  }, []);

  const handleTogglePlatform = useCallback((platform: string) => {
    setPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform],
    );
  }, []);

  const handleSave = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsSaving(true);
    setError(null);

    try {
      const payload = {
        dailyCreditBudget,
        engagementKeywords,
        engagementTone,
        isEngagementEnabled,
        label,
        maxEngagementsPerDay,
        platforms,
        postsPerWeek,
        runFrequency,
        timezone,
        topics,
        voice: voice || undefined,
        weeklyCreditBudget,
      };

      let updated: AgentStrategy;
      if (strategy) {
        updated = await runAgentApiEffect(
          apiService.updateStrategyEffect(
            strategy.id,
            payload,
            abortRef.current.signal,
          ),
        );
      } else {
        updated = await runAgentApiEffect(
          apiService.createStrategyEffect(payload, abortRef.current.signal),
        );
      }
      setStrategy(updated);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to save strategy');
    } finally {
      setIsSaving(false);
    }
  }, [
    apiService,
    strategy,
    label,
    topics,
    voice,
    platforms,
    postsPerWeek,
    runFrequency,
    timezone,
    dailyCreditBudget,
    weeklyCreditBudget,
    isEngagementEnabled,
    engagementKeywords,
    engagementTone,
    maxEngagementsPerDay,
    setStrategy,
    setError,
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Autopilot Configuration
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Configure how the AI agent creates and manages content
            automatically.
          </p>
        </div>
        {strategy && (
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={async () => {
              abortRef.current?.abort();
              abortRef.current = new AbortController();
              try {
                const updated = await runAgentApiEffect(
                  apiService.toggleStrategyEffect(
                    strategy.id,
                    abortRef.current.signal,
                  ),
                );
                setStrategy(updated);
              } catch {
                // Silently ignore toggle errors
              }
            }}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              strategy.isActive ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
                strategy.isActive ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </Button>
        )}
      </div>

      {/* Content Strategy */}
      <section className="space-y-4 rounded-lg border border-border p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Content Strategy
        </h3>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Weekly lifestyle content"
            className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Topics</label>
          <div className="flex gap-2">
            <input
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
              className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
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
          <label className="text-xs font-medium text-foreground">Voice</label>
          <textarea
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            placeholder="Describe your brand voice..."
            rows={3}
            className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">
            Platforms
          </label>
          <div className="flex flex-wrap gap-2">
            {PLATFORM_OPTIONS.map((platform) => (
              <Button
                key={platform}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => handleTogglePlatform(platform)}
                className={`rounded border px-3 py-1 text-xs font-medium capitalize transition-colors ${
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

      {/* Schedule */}
      <section className="space-y-4 rounded-lg border border-border p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Schedule
        </h3>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              Run Frequency
            </label>
            <select
              value={runFrequency}
              onChange={(e) => setRunFrequency(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              {RUN_FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              Posts / Week
            </label>
            <input
              type="number"
              value={postsPerWeek}
              onChange={(e) => setPostsPerWeek(Number(e.target.value))}
              min={1}
              max={100}
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* Budget */}
      <section className="space-y-4 rounded-lg border border-border p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Budget
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              Daily Credit Budget
            </label>
            <input
              type="number"
              value={dailyCreditBudget}
              onChange={(e) => setDailyCreditBudget(Number(e.target.value))}
              min={0}
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              Weekly Credit Budget
            </label>
            <input
              type="number"
              value={weeklyCreditBudget}
              onChange={(e) => setWeeklyCreditBudget(Number(e.target.value))}
              min={0}
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* Engagement (collapsible) */}
      <section className="rounded-lg border border-border">
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
              <label className="text-xs font-medium text-foreground">
                Enable Engagement
              </label>
              <Button
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => setIsEngagementEnabled(!isEngagementEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  isEngagementEnabled ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
                    isEngagementEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </Button>
            </div>

            {isEngagementEnabled && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">
                    Keywords
                  </label>
                  <div className="flex gap-2">
                    <input
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
                      className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
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
                    <label className="text-xs font-medium text-foreground">
                      Tone
                    </label>
                    <select
                      value={engagementTone}
                      onChange={(e) => setEngagementTone(e.target.value)}
                      className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                      {TONE_OPTIONS.map((tone) => (
                        <option key={tone} value={tone}>
                          {tone.charAt(0).toUpperCase() + tone.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">
                      Max / Day
                    </label>
                    <input
                      type="number"
                      value={maxEngagementsPerDay}
                      onChange={(e) =>
                        setMaxEngagementsPerDay(Number(e.target.value))
                      }
                      min={0}
                      max={100}
                      className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Save */}
      <Button
        variant={ButtonVariant.DEFAULT}
        onClick={handleSave}
        isDisabled={isSaving || !label.trim()}
        isLoading={isSaving}
        className="w-full"
      >
        {isSaving ? 'Saving...' : strategy ? 'Save Changes' : 'Create Strategy'}
      </Button>
    </div>
  );
}
