/**
 * Connection-Model Mapping Tests
 *
 * Builds a full model→connection mapping by statically parsing all module files,
 * then asserts critical mappings and snapshots the entire map to catch accidental
 * model moves between databases.
 */
import path from 'node:path';

import { buildModelConnectionMap } from '@api/__tests__/helpers/module-parser';

const API_SRC = path.resolve(__dirname, '..');

describe('Connection-Model Mapping', () => {
  let modelMap: Record<string, string>;

  beforeAll(() => {
    modelMap = buildModelConnectionMap(API_SRC);
  });

  it('should find models across all modules', () => {
    expect(Object.keys(modelMap).length).toBeGreaterThan(0);
  });

  describe('Critical model→connection mappings', () => {
    const criticalMappings: Array<{
      connection: string;
      model: string;
    }> = [
      // Auth database
      { connection: 'AUTH', model: 'User' },
      { connection: 'AUTH', model: 'Organization' },
      { connection: 'AUTH', model: 'Member' },
      { connection: 'AUTH', model: 'Role' },
      { connection: 'AUTH', model: 'Setting' },
      { connection: 'AUTH', model: 'ApiKey' },
      { connection: 'AUTH', model: 'Customer' },
      { connection: 'AUTH', model: 'Profile' },
      { connection: 'AUTH', model: 'OrganizationSetting' },
      { connection: 'AUTH', model: 'Subscription' },
      { connection: 'AUTH', model: 'SubscriptionAttribution' },
      { connection: 'AUTH', model: 'UserSubscription' },
      { connection: 'AUTH', model: 'CreditBalance' },

      // Default (cloud) database
      { connection: 'CLOUD', model: 'Post' },
      { connection: 'CLOUD', model: 'Asset' },
      { connection: 'CLOUD', model: 'Article' },
      { connection: 'CLOUD', model: 'Brand' },
      { connection: 'CLOUD', model: 'Workflow' },

      // CRM database
      { connection: 'CRM', model: 'Lead' },

      // Clips database
      { connection: 'CLIPS', model: 'ClipProject' },
      { connection: 'CLIPS', model: 'ClipResult' },

      // Analytics database
      { connection: 'ANALYTICS', model: 'Analytic' },
      { connection: 'ANALYTICS', model: 'Insight' },

      // Agent database
      { connection: 'AGENT', model: 'AgentRoom' },
      { connection: 'AGENT', model: 'AgentMessageDoc' },
      { connection: 'AGENT', model: 'AgentStrategy' },

      // Fanvue database
      { connection: 'FANVUE', model: 'FanvueSubscriber' },
    ];

    for (const { connection, model } of criticalMappings) {
      it(`${model} should be on ${connection} connection`, () => {
        expect(modelMap[model]).toBe(connection);
      });
    }
  });

  it('should match the full model→connection snapshot', () => {
    // Sort keys for stable snapshot
    const sortedMap: Record<string, string> = {};
    for (const key of Object.keys(modelMap).sort()) {
      sortedMap[key] = modelMap[key];
    }
    expect(sortedMap).toMatchSnapshot();
  });
});
