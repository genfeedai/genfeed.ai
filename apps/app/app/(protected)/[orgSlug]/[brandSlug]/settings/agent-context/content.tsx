'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  AgentBrandContextEditTarget,
  AgentBrandContextLayerKey,
} from '@genfeedai/contracts/interfaces';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { BrainCircuit, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import AgentContextInsightsCard from './agent-context-insights-card';
import AgentContextLayerBody from './agent-context-layer-body';
import AgentContextLayerCard from './agent-context-layer-card';
import AgentContextMemoriesSection from './agent-context-memories-section';
import AgentContextOverviewCard from './agent-context-overview-card';
import AgentContextPromptCard from './agent-context-prompt-card';
import { useAgentContextPage } from './use-agent-context-page';

const BRAND_LAYERS: AgentBrandContextLayerKey[] = [
  'identity',
  'guidelines',
  'visualIdentity',
  'voice',
  'strategy',
  'persona',
  'prompting',
];

const RETRIEVAL_LAYERS: AgentBrandContextLayerKey[] = [
  'patterns',
  'knowledge',
  'recentPosts',
];

/**
 * What the agent knows about this brand — the exact context a chat turn is
 * given, layer by layer, with links to where each layer is edited.
 */
export default function BrandSettingsAgentContextPage() {
  const translate = useTranslations('pages.brandAgentContext');
  const { href } = useOrgUrl();
  const {
    archivePersonalMemory,
    brandId,
    brandMemories,
    insights,
    isInsightsError,
    isLoadError,
    isMemoriesError,
    isReady,
    isRefreshing,
    pendingMemoryId,
    personalMemories,
    preview,
    refresh,
    snapshot,
  } = useAgentContextPage();

  const editHrefs = useMemo<Record<AgentBrandContextEditTarget, string>>(
    () => ({
      interview: href('/settings/interview'),
      kit: href('/settings/kit'),
      knowledge: href(APP_ROUTES.SETTINGS.KNOWLEDGE),
      memory: '#agent-context-memories',
      profile: href(APP_ROUTES.SETTINGS.ROOT),
      skills: href(APP_ROUTES.SETTINGS.SKILLS),
      voice: href('/settings/voice'),
    }),
    [href],
  );

  const statusByKey = useMemo(
    () =>
      new Map(
        (snapshot?.layerStatus ?? []).map((status) => [status.key, status]),
      ),
    [snapshot],
  );

  const renderLayer = (layerKey: AgentBrandContextLayerKey) =>
    snapshot ? (
      <AgentContextLayerCard
        editHrefs={editHrefs}
        key={layerKey}
        layerKey={layerKey}
        status={statusByKey.get(layerKey)}
      >
        <AgentContextLayerBody
          layerKey={layerKey}
          layers={snapshot.layers}
          systemPrompt={snapshot.systemPrompt}
        />
      </AgentContextLayerCard>
    ) : null;

  let body = null;
  if (!isReady || !brandId || (!snapshot && !isLoadError)) {
    body = <Loading isFullSize={false} />;
  } else if (!snapshot) {
    body = (
      <CardEmpty
        actions={
          <Button
            label={translate('retry')}
            onClick={refresh}
            variant={ButtonVariant.SECONDARY}
          />
        }
        icon={TriangleAlert}
        label={translate('loadError')}
      />
    );
  } else {
    body = (
      <div className="flex w-full flex-col gap-3">
        <AgentContextOverviewCard
          isRefreshing={isRefreshing}
          key={snapshot.query}
          onPreview={preview}
          onRefresh={refresh}
          snapshot={snapshot}
        />

        {BRAND_LAYERS.map(renderLayer)}

        <AgentContextLayerCard
          editHrefs={editHrefs}
          layerKey="performanceInsights"
          status={statusByKey.get('performanceInsights')}
        >
          <AgentContextLayerBody
            layerKey="performanceInsights"
            layers={snapshot.layers}
            systemPrompt={snapshot.systemPrompt}
          />
        </AgentContextLayerCard>
        <AgentContextInsightsCard
          insights={insights}
          isError={isInsightsError}
        />

        {RETRIEVAL_LAYERS.map(renderLayer)}

        <AgentContextMemoriesSection
          brandMemories={brandMemories}
          editHrefs={editHrefs}
          injectedMemories={snapshot.memories}
          injectedStatus={statusByKey.get('memories')}
          isMemoriesError={isMemoriesError}
          onArchive={(memoryId) => void archivePersonalMemory(memoryId)}
          pendingMemoryId={pendingMemoryId}
          personalMemories={personalMemories}
        />

        <AgentContextLayerCard
          editHrefs={editHrefs}
          layerKey="skills"
          status={statusByKey.get('skills')}
        >
          <div className="flex flex-wrap gap-2">
            {snapshot.skills.map((skill) => (
              <Badge key={skill.slug} variant="outline">
                {skill.name}
              </Badge>
            ))}
          </div>
        </AgentContextLayerCard>

        <AgentContextPromptCard
          memoryPrompt={snapshot.memoryPrompt}
          systemPrompt={snapshot.systemPrompt}
        />
      </div>
    );
  }

  return (
    <Container
      description={translate('description')}
      icon={BrainCircuit}
      label={translate('title')}
    >
      {body}
    </Container>
  );
}
