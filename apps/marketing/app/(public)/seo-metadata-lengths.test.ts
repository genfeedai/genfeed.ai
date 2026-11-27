import {
  AGENT_CLIENT_CHANNEL_SLUGS,
  buildAgentClientChannelPage,
} from '@data/agent-client-channels.data';
import { agentClients } from '@data/agent-clients.data';
import { appProducts } from '@data/app-products.data';
import { competitors } from '@data/competitors.data';
import { integrations } from '@data/integrations.data';
import {
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_DESCRIPTION_MIN_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  SEO_TITLE_MIN_LENGTH,
  withBrandSuffix,
} from '@data/seo-copy';
import { useCases } from '@data/use-cases.data';
import { serviceLandingConfigs } from '@web-components/landing/service-landings.data';
import { socialGrowthLandingConfigs } from '@web-components/landing/social-growth-landings.data';
import { describe, expect, it } from 'vitest';
import * as AboutPage from './about/page';
import * as AgentPage from './agent/page';
import * as FeaturesPage from './features/page';
import * as HireAgentsPage from './hire-agents/page';
import {
  buildIntegrationDescription,
  buildIntegrationTitle,
} from './integrations/[slug]/page';
import * as IntegrationsPage from './integrations/page';
import * as PostsPage from './posts/page';
import * as SelfHostedPage from './self-hosted/page';
import * as ToolsPage from './tools/page';
import { getUseCaseAudienceName } from './use-cases/[slug]/page';
import { buildComparisonDescription } from './vs/[slug]/page';

const EMPTY_PARENT = Promise.resolve({}) as never;

function expectTitleFits(title: string) {
  expect(title.length, title).toBeGreaterThanOrEqual(SEO_TITLE_MIN_LENGTH);
  expect(title.length, title).toBeLessThanOrEqual(SEO_TITLE_MAX_LENGTH);
}

function expectDescriptionFits(description: string) {
  expect(description.length, description).toBeGreaterThanOrEqual(
    SEO_DESCRIPTION_MIN_LENGTH,
  );
  expect(description.length, description).toBeLessThanOrEqual(
    SEO_DESCRIPTION_MAX_LENGTH,
  );
}

describe('templated pages keep their metadata inside the audit budget', () => {
  it.each(integrations.map((integration) => [integration.slug, integration]))(
    '/integrations/%s',
    (_slug, integration) => {
      expectTitleFits(buildIntegrationTitle(integration));
      expectDescriptionFits(buildIntegrationDescription(integration));
    },
  );

  it.each(competitors.map((competitor) => [competitor.slug, competitor.name]))(
    '/vs/%s',
    (_slug, name) => {
      expectDescriptionFits(buildComparisonDescription(name));
      expectTitleFits(
        `Genfeed vs ${name} (2026): features and pricing compared`,
      );
    },
  );

  it.each(useCases.map((useCase) => [useCase.slug, useCase]))(
    '/use-cases/%s',
    (_slug, useCase) => {
      expectTitleFits(withBrandSuffix(useCase.seoTitle));
      expectDescriptionFits(useCase.seoDescription);
      expect(getUseCaseAudienceName(useCase)).not.toMatch(/^Genfeed for /);
    },
  );

  it.each(appProducts.map((product) => [product.slug, product]))(
    '/products/%s',
    (_slug, product) => {
      expectTitleFits(withBrandSuffix(product.seoTitle));
      expectDescriptionFits(product.description);
    },
  );

  it.each(
    agentClients.flatMap((client) =>
      AGENT_CLIENT_CHANNEL_SLUGS.map(
        (channel) => [`${client.slug}/${channel}`, client, channel] as const,
      ),
    ),
  )('/%s', (_path, client, channel) => {
    expectDescriptionFits(
      buildAgentClientChannelPage(client, channel).description,
    );
  });

  it.each(agentClients.map((client) => [client.slug, client.title]))(
    '/%s',
    (_slug, title) => {
      expectTitleFits(withBrandSuffix(`${title}: Connect via MCP`));
    },
  );

  it.each(
    [...serviceLandingConfigs, ...socialGrowthLandingConfigs].map((config) => [
      config.slug,
      config,
    ]),
  )('/%s', (_slug, config) => {
    expectTitleFits(config.metaTitle);
    expectDescriptionFits(config.metaDescription);
  });
});

describe('static pages keep their metadata inside the audit budget', () => {
  it.each([
    ['/about', AboutPage],
    ['/agent', AgentPage],
    ['/features', FeaturesPage],
    ['/hire-agents', HireAgentsPage],
    ['/integrations', IntegrationsPage],
    ['/posts', PostsPage],
    ['/self-hosted', SelfHostedPage],
    ['/tools', ToolsPage],
  ] as const)('%s', async (_path, page) => {
    const meta = await page.generateMetadata({} as never, EMPTY_PARENT);

    expectTitleFits(String(meta.title));
    expectDescriptionFits(String(meta.description));
  });
});
