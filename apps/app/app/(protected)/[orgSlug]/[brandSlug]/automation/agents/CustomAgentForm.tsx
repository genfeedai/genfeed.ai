import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
  type Platform,
} from '@genfeedai/contracts';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isBrandResourceReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { preferredWorkflowTemplateIdForAgentType } from '@pages/agents/content-team/content-team-presets';
import type { ContentTeamHirePageProps } from '@props/automation/content-team-hire-page.props';
import {
  AgentStrategiesService,
  type CreateAgentStrategyInput,
} from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AGENT_PLATFORM_OPTIONS } from './agent-type-display';

export default function CustomAgentForm({
  onCreated,
}: ContentTeamHirePageProps) {
  const translate = useTranslations('common.automation.agentCreation');
  const scope = useCollectionScope();
  const getService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [topics, setTopics] = useState('');
  const [voice, setVoice] = useState('');
  const [postsPerWeek, setPostsPerWeek] = useState('7');
  const [runFrequency, setRunFrequency] = useState<string>(
    AgentRunFrequency.DAILY,
  );
  const [budget, setBudget] = useState('100');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const topicList = topics
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const dailyCreditBudget = Number(budget);
  const count = Number(postsPerWeek);
  const isValid =
    platforms.length > 0 &&
    topicList.length > 0 &&
    voice.trim().length > 0 &&
    Number.isInteger(count) &&
    count >= 1 &&
    count <= 100 &&
    Number.isFinite(dailyCreditBudget) &&
    dailyCreditBudget > 0;

  async function createAgent() {
    if (
      isSubmitting ||
      !isValid ||
      !scope.brandId ||
      !isBrandResourceReady(scope)
    )
      return;
    const input: CreateAgentStrategyInput = {
      agentType: AgentType.GENERAL,
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      brandId: scope.brandId,
      dailyCreditBudget,
      displayRole: translate('custom'),
      isActive: true,
      label: translate('customAgent'),
      minCreditThreshold: Math.max(25, Math.floor(dailyCreditBudget / 2)),
      platforms,
      preferredWorkflowTemplateId: preferredWorkflowTemplateIdForAgentType(
        AgentType.GENERAL,
      ),
      skillSlugs: ['content-writing'],
      postsPerWeek: count,
      reportsToLabel: 'Main Orchestrator',
      runFrequency,
      topics: topicList,
      voice: voice.trim(),
      weeklyCreditBudget: dailyCreditBudget * 5,
    };
    setIsSubmitting(true);
    try {
      const service = await getService();
      await service.create(input);
      NotificationsService.getInstance().success(translate('created'));
      await onCreated?.();
    } catch (error) {
      logger.error('Failed to create custom agent', error);
      NotificationsService.getInstance().error(translate('createError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isBrandResourceReady(scope) || !scope.brandId) {
    return (
      <p>
        {translate(scope.pageScope === 'org' ? 'selectBrand' : 'loadingBrand')}
      </p>
    );
  }

  return (
    <Form
      onSubmit={(event) => {
        event.preventDefault();
        void createAgent();
      }}
    >
      <p className="text-sm text-muted-foreground">
        {translate('customDescription')}
      </p>
      <FormControl label={translate('platforms')}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AGENT_PLATFORM_OPTIONS.map((platform) => (
            <div key={platform} className="flex items-center gap-2">
              <Checkbox
                id={`custom-agent-platform-${platform}`}
                checked={platforms.includes(platform)}
                disabled={isSubmitting}
                onCheckedChange={(checked) =>
                  setPlatforms((current) =>
                    checked === true
                      ? [...new Set([...current, platform])]
                      : current.filter((value) => value !== platform),
                  )
                }
              />
              <Label htmlFor={`custom-agent-platform-${platform}`}>
                {translate(`platformOptions.${platform}`)}
              </Label>
            </div>
          ))}
        </div>
      </FormControl>
      <FormControl label={translate('topics')}>
        <Input
          aria-label={translate('topics')}
          value={topics}
          onChange={(event) => setTopics(event.target.value)}
          isRequired
          isDisabled={isSubmitting}
        />
      </FormControl>
      <FormControl label={translate('voice')}>
        <Textarea
          aria-label={translate('voice')}
          value={voice}
          onChange={(event) => setVoice(event.target.value)}
          isRequired
          isDisabled={isSubmitting}
        />
      </FormControl>
      <FormControl label={translate('postsPerWeek')}>
        <Input
          aria-label={translate('postsPerWeek')}
          type="number"
          min={1}
          max={100}
          step={1}
          value={postsPerWeek}
          onChange={(event) => setPostsPerWeek(event.target.value)}
          isRequired
          isDisabled={isSubmitting}
        />
      </FormControl>
      <FormControl label={translate('runFrequency')}>
        <Select
          value={runFrequency}
          onValueChange={setRunFrequency}
          disabled={isSubmitting}
        >
          <SelectTrigger aria-label={translate('runFrequency')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(AgentRunFrequency).map((value) => (
              <SelectItem key={value} value={value}>
                {translate(`frequency.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormControl>
      <FormControl label={translate('budget')}>
        <Input
          aria-label={translate('budget')}
          type="number"
          min={1}
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
          isRequired
          isDisabled={isSubmitting}
        />
      </FormControl>
      <Button
        type="submit"
        isDisabled={!isValid || isSubmitting}
        isLoading={isSubmitting}
      >
        {translate('customAction')}
      </Button>
    </Form>
  );
}
