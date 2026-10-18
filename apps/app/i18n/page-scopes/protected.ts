import analytics from '../../messages/en/pages/analytics.json';
import help from '../../messages/en/pages/help.json';
import organizationLanding from '../../messages/en/pages/organizationLanding.json';
import organizationRouting from '../../messages/en/pages/organizationRouting.json';
import platformFlags from '../../messages/en/pages/platformFlags.json';

const messages = {
  help,
  organizationLanding,
  organizationRouting,
  platformFlags,
  analytics: {
    metricDefinitions: analytics.metricDefinitions,
    metricLabels: analytics.metricLabels,
    metricDefinitionLabel: analytics.metricDefinitionLabel,
  },
};

export default messages;
