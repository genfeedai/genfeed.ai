import activities from '../../messages/en/pages/activities.json';
import adminAgents from '../../messages/en/pages/adminAgents.json';
import adminCreditHolds from '../../messages/en/pages/adminCreditHolds.json';
import adminEconomics from '../../messages/en/pages/adminEconomics.json';
import adminFlags from '../../messages/en/pages/adminFlags.json';
import adminGenerations from '../../messages/en/pages/adminGenerations.json';
import adminModelPricing from '../../messages/en/pages/adminModelPricing.json';
import adminOrganizationReleases from '../../messages/en/pages/adminOrganizationReleases.json';
import adminTemplates from '../../messages/en/pages/adminTemplates.json';
import adminTrainings from '../../messages/en/pages/adminTrainings.json';
import adminUsers from '../../messages/en/pages/adminUsers.json';
import adminVoices from '../../messages/en/pages/adminVoices.json';
import adminWorkflows from '../../messages/en/pages/adminWorkflows.json';
import agentFailures from '../../messages/en/pages/agentFailures.json';
import analytics from '../../messages/en/pages/analytics.json';
import library from '../../messages/en/pages/library.json';
import models from '../../messages/en/pages/models.json';
import platformSettings from '../../messages/en/pages/platformSettings.json';
import posts from '../../messages/en/pages/posts.json';
import studioPlayground from '../../messages/en/pages/studioPlayground.json';
import systemEmailPerformance from '../../messages/en/pages/systemEmailPerformance.json';
import unitEconomics from '../../messages/en/pages/unitEconomics.json';
import warmupAccounts from '../../messages/en/pages/warmupAccounts.json';

const messages = {
  activities,
  analytics: {
    accounts: analytics.accounts,
    overview: analytics.overview,
    performanceDataset: analytics.performanceDataset,
  },
  library,
  models,
  posts: { list: posts.list, detail: posts.detail },
  studioPlayground: { crun: studioPlayground.crun },
  warmupAccounts,
  agentFailures,
  adminOrganizationReleases,
  adminFlags,
  platformSettings,
  adminAgents,
  adminUsers,
  unitEconomics,
  adminTemplates,
  adminTrainings,
  adminCreditHolds,
  adminEconomics,
  adminGenerations,
  adminWorkflows,
  adminVoices,
  adminModelPricing,
  systemEmailPerformance,
};

export default messages;
