import {
  buildAgentInitiatingPrincipal,
  projectAgentInitiatingPrincipal,
  resolveToolSchedulePrincipal,
} from '@api/services/agent-orchestrator/utils/agent-initiating-principal.util';
import { describe, expect, it } from 'vitest';

const identity = { organizationId: 'org-1', userId: 'user-1' };

describe('agent initiating principal', () => {
  describe('buildAgentInitiatingPrincipal', () => {
    it('captures a session user with the resolved database ids', () => {
      expect(
        buildAgentInitiatingPrincipal({
          auth: { isApiKey: false },
          ...identity,
        }),
      ).toEqual({
        isApiKey: false,
        organizationId: 'org-1',
        scopes: [],
        userId: 'user-1',
      });
    });

    it('captures an API key with its id and scopes', () => {
      expect(
        buildAgentInitiatingPrincipal({
          auth: {
            apiKeyId: 'key-1',
            isApiKey: true,
            scopes: ['posts:schedule'],
          },
          ...identity,
        }),
      ).toEqual({
        apiKeyId: 'key-1',
        isApiKey: true,
        organizationId: 'org-1',
        scopes: ['posts:schedule'],
        userId: 'user-1',
      });
    });
  });

  describe('projectAgentInitiatingPrincipal', () => {
    const stored = {
      isApiKey: false,
      organizationId: 'org-1',
      scopes: [],
      userId: 'user-1',
    };

    it('reads a persisted principal that matches the executing identity', () => {
      expect(projectAgentInitiatingPrincipal(stored, identity)).toEqual(stored);
    });

    it('copies only the authenticated fields', () => {
      expect(
        projectAgentInitiatingPrincipal(
          { ...stored, role: 'OWNER', token: 'secret' },
          identity,
        ),
      ).toEqual(stored);
    });

    it.each([
      ['a missing value', undefined],
      ['null', null],
      ['a non-object', 'user-1'],
      ['another user', { ...stored, userId: 'user-2' }],
      ['another organization', { ...stored, organizationId: 'org-2' }],
      ['a non-boolean key flag', { ...stored, isApiKey: 'false' }],
      ['non-string scopes', { ...stored, scopes: [1] }],
      ['a blank api key id', { ...stored, apiKeyId: ' ' }],
    ])('yields none for %s', (_label, value) => {
      expect(projectAgentInitiatingPrincipal(value, identity)).toBeUndefined();
    });
  });

  describe('resolveToolSchedulePrincipal', () => {
    const principal = {
      isApiKey: false,
      organizationId: 'org-1',
      scopes: [],
      userId: 'user-1',
    };

    it('returns the captured principal for an authenticated turn', () => {
      expect(
        resolveToolSchedulePrincipal({
          ...identity,
          initiatingPrincipal: principal,
        }),
      ).toEqual(principal);
    });

    it('returns none for a system turn that carries no principal', () => {
      expect(resolveToolSchedulePrincipal(identity)).toBeUndefined();
    });

    it('never binds a proactive turn, even when a principal is present', () => {
      expect(
        resolveToolSchedulePrincipal({
          ...identity,
          initiatingPrincipal: principal,
          isProactive: true,
        }),
      ).toBeUndefined();
    });

    it('never binds when the tool runs as a different user than the principal', () => {
      expect(
        resolveToolSchedulePrincipal({
          initiatingPrincipal: principal,
          organizationId: 'org-1',
          userId: 'someone-else',
        }),
      ).toBeUndefined();
    });
  });
});
