import type { AgentStrategy } from '@genfeedai/agent/models/agent-strategy.model';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import type { AgentStrategyApiService } from '@genfeedai/agent/services/agent-strategy-api.service';
import { useAgentStrategyStore } from '@genfeedai/agent/stores/agent-strategy.store';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AgentStrategyBudgetSection } from './AgentStrategyBudgetSection';
import { AgentStrategyContentSection } from './AgentStrategyContentSection';
import { AgentStrategyEngagementSection } from './AgentStrategyEngagementSection';
import { AgentStrategyHeader } from './AgentStrategyHeader';
import { AgentStrategyScheduleSection } from './AgentStrategyScheduleSection';

interface AgentStrategyConfigProps {
  apiService: AgentStrategyApiService;
}

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
        <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <AgentStrategyHeader
        strategy={strategy}
        abortRef={abortRef}
        apiService={apiService}
        setStrategy={setStrategy}
      />

      <AgentStrategyContentSection
        label={label}
        setLabel={setLabel}
        topicInput={topicInput}
        setTopicInput={setTopicInput}
        handleAddTopic={handleAddTopic}
        handleRemoveTopic={handleRemoveTopic}
        topics={topics}
        voice={voice}
        setVoice={setVoice}
        platforms={platforms}
        handleTogglePlatform={handleTogglePlatform}
      />

      <AgentStrategyScheduleSection
        runFrequency={runFrequency}
        setRunFrequency={setRunFrequency}
        timezone={timezone}
        setTimezone={setTimezone}
        postsPerWeek={postsPerWeek}
        setPostsPerWeek={setPostsPerWeek}
      />

      <AgentStrategyBudgetSection
        dailyCreditBudget={dailyCreditBudget}
        setDailyCreditBudget={setDailyCreditBudget}
        weeklyCreditBudget={weeklyCreditBudget}
        setWeeklyCreditBudget={setWeeklyCreditBudget}
      />

      <AgentStrategyEngagementSection
        isEngagementOpen={isEngagementOpen}
        setIsEngagementOpen={setIsEngagementOpen}
        isEngagementEnabled={isEngagementEnabled}
        setIsEngagementEnabled={setIsEngagementEnabled}
        keywordInput={keywordInput}
        setKeywordInput={setKeywordInput}
        handleAddKeyword={handleAddKeyword}
        handleRemoveKeyword={handleRemoveKeyword}
        engagementKeywords={engagementKeywords}
        engagementTone={engagementTone}
        setEngagementTone={setEngagementTone}
        maxEngagementsPerDay={maxEngagementsPerDay}
        setMaxEngagementsPerDay={setMaxEngagementsPerDay}
      />

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
