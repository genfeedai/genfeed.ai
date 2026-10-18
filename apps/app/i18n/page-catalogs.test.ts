import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import pages from '../messages/en/pages';

const ORIGINAL_NAMES = [
  'about',
  'accountHistoryImport',
  'activities',
  'adminCreditHolds',
  'adminFlags',
  'adminGenerations',
  'adminModelPricing',
  'adminOrganizationReleases',
  'adminTemplates',
  'adminUsers',
  'adminVoices',
  'adminWorkflows',
  'adsResearch',
  'agentFailures',
  'analytics',
  'articles',
  'autopilot',
  'botAccountLinks',
  'brandAgentContext',
  'brandAgentProfile',
  'brandAgentSettings',
  'brandDetailOverview',
  'brandHarnessSettings',
  'brandIntegrations',
  'brandKitReview',
  'brandKitSettings',
  'brandOsSettings',
  'brandPublishingSettings',
  'brandSocialMedia',
  'brandWatermark',
  'connectGenfeed',
  'connectSocial',
  'costUsage',
  'credentialPostingTimes',
  'generationReceipts',
  'help',
  'identityDefaults',
  'library',
  'models',
  'onboarding',
  'organizationLanding',
  'organizationRouting',
  'outreachCampaign',
  'platformFlags',
  'platformSettings',
  'platforms',
  'posts',
  'productEmailPreferences',
  'publishing',
  'remixBrief',
  'replyDrip',
  'socialIntelligence',
  'socialWarmup',
  'studioClips',
  'studioEditor',
  'studioEditorLock',
  'studioMotion',
  'studioPlayground',
  'studioStoryboard',
  'systemEmailPerformance',
  'tasks',
  'turboProjects',
  'unitEconomics',
  'warmupAccounts',
  'workflows',
  'workspaceOverview',
];

describe('page catalog partitions', () => {
  it('preserves all 66 original namespaces and every partition in the aggregate', () => {
    const directory = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../messages/en/pages',
    );
    const files = readdirSync(directory)
      .filter((file) => file.endsWith('.json'))
      .sort();
    expect(Object.keys(pages).sort()).toEqual(ORIGINAL_NAMES);
    expect(files.map((file) => file.slice(0, -5))).toEqual(ORIGINAL_NAMES);
    for (const file of files) {
      expect(pages[file.slice(0, -5) as keyof typeof pages]).toEqual(
        JSON.parse(readFileSync(path.join(directory, file), 'utf8')),
      );
    }
  });
});
