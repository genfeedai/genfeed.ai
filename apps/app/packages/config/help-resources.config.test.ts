import { describe, expect, it } from 'vitest';
import { getHelpDestination, getHelpResources } from './help-resources.config';

const destinations = {
  changelog: 'https://example.com/releases',
  cloudSupport: 'https://example.com/cloud-support',
  community: 'https://example.com/community',
  documentation: 'https://example.com/docs',
  faq: 'https://example.com/faq',
  gettingStarted: 'https://example.com/start',
  selfHostedGettingStarted: 'https://example.com/install',
  selfHostedSupport: 'https://local.example.com/help',
  workflows: 'https://example.com/workflows',
};

describe('Help resource contract', () => {
  it('routes self-hosted users to their operator and local setup guide', () => {
    const resources = getHelpResources(true, destinations);
    expect(
      resources.find((resource) => resource.id === 'gettingStarted')?.url,
    ).toBe(destinations.selfHostedGettingStarted);
    expect(
      resources.find((resource) => resource.id === 'support'),
    ).toMatchObject({
      owner: 'deployment-operator',
      url: destinations.selfHostedSupport,
    });
    expect(resources.map((resource) => resource.url)).not.toContain(
      destinations.cloudSupport,
    );
  });

  it.each([
    undefined,
    '',
    ' ',
    '/relative',
    'javascript:alert(1)',
    'data:text/html,test',
    'https://user:password@example.com',
    'not a url',
  ])('rejects an unsafe or unconfigured destination: %s', (value) => {
    expect(getHelpDestination(value)).toBeNull();
  });
});
