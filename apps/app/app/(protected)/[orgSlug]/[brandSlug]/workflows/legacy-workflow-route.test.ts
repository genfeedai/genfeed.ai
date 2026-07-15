import { APP_ROUTES } from '@genfeedai/constants';
import { describe, expect, it } from 'vitest';
import { buildLegacyWorkflowRouteRedirect } from './legacy-workflow-route';

describe('buildLegacyWorkflowRouteRedirect', () => {
  it('preserves route scope and opaque conversation-shell state', () => {
    expect(
      buildLegacyWorkflowRouteRedirect({
        brandSlug: 'moonrise',
        destination: APP_ROUTES.ORCHESTRATION.AUTOPILOT,
        orgSlug: 'acme',
        searchParams: {
          filter: 'active',
          overlay: 'workflow-picker',
          overlayRef: 'workflow:workflow-1',
          thread: 'thread-1',
        },
      }),
    ).toBe(
      '/acme/moonrise/orchestration/autopilot?filter=active&overlay=workflow-picker&overlayRef=workflow%3Aworkflow-1&thread=thread-1',
    );
  });

  it('preserves repeated query values deterministically', () => {
    expect(
      buildLegacyWorkflowRouteRedirect({
        brandSlug: 'moonrise',
        destination: APP_ROUTES.ORCHESTRATION.CONFIGURATION,
        orgSlug: 'acme',
        searchParams: { panel: ['model', 'publishing'] },
      }),
    ).toBe(
      '/acme/moonrise/orchestration/configuration?panel=model&panel=publishing',
    );
  });

  it('does not add an empty query string', () => {
    expect(
      buildLegacyWorkflowRouteRedirect({
        brandSlug: 'moonrise',
        destination: APP_ROUTES.ORCHESTRATION.AUTOPILOT,
        orgSlug: 'acme',
      }),
    ).toBe('/acme/moonrise/orchestration/autopilot');
  });
});
