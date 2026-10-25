import { MemberRole } from '@genfeedai/contracts';
import type { AgentArtifactReference } from '@genfeedai/contracts/interfaces';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createLibraryDockSuggestions,
  resolveAgentDockSuggestions,
} from './agent-dock-suggestions.util';

const asset = {
  kind: 'ingredient',
  serializer: 'ingredient',
  organizationId: 'org-1',
  brandId: 'brand-1',
  recordId: 'asset-1',
} satisfies AgentArtifactReference;
const post = {
  kind: 'post',
  serializer: 'post',
  organizationId: 'org-1',
  brandId: 'brand-1',
  recordId: 'post-1',
} satisfies AgentArtifactReference;

describe('agent dock suggestions', () => {
  it('keeps page actions with no selected records', () => {
    const actions = [{ label: 'Check analytics', prompt: 'Check analytics' }];
    expect(resolveAgentDockSuggestions(undefined, actions)).toEqual(actions);
  });

  it('uses record-kind-aware suggestions without assuming an ingredient is a video', () => {
    const actions = resolveAgentDockSuggestions(
      [{ label: 'One asset', reference: asset }],
      [],
      MemberRole.CREATOR,
    );
    expect(actions.map((action) => action.label)).toContain('Write a caption');
    expect(actions.map((action) => action.label)).not.toContain('Create clips');
    expect(
      resolveAgentDockSuggestions([post], [], MemberRole.CREATOR).map(
        (action) => action.label,
      ),
    ).not.toContain('Write a caption');
  });

  it('deduplicates wrapped and raw references and updates actions for a selection of several records', () => {
    const duplicate = resolveAgentDockSuggestions(
      [asset, { label: 'Same asset', reference: asset }],
      [],
      MemberRole.CREATOR,
    );
    expect(duplicate[0]?.label).toBe('Draft a post');
    const multiple = resolveAgentDockSuggestions(
      [asset, post],
      [],
      MemberRole.CREATOR,
    );
    expect(multiple.map((action) => action.label)).toEqual([
      'Draft posts',
      'Review selection',
      'Create variations',
      'Organize selection',
    ]);
    expect(multiple.every((action) => action.icon !== undefined)).toBe(true);
    expect(asset.recordId).toBe('asset-1');
  });

  it('keeps read-only and unknown roles on read actions', () => {
    for (const role of [undefined, MemberRole.USER, MemberRole.ANALYTICS]) {
      expect(
        resolveAgentDockSuggestions([asset], [], role).map(
          (action) => action.label,
        ),
      ).toEqual(['Review selection']);
      expect(
        resolveAgentDockSuggestions(
          undefined,
          createLibraryDockSuggestions(),
          role,
        ).map((action) => action.label),
      ).toEqual(['Find an asset', 'Review recent assets']);
    }
  });

  it('renders the same post, caption and organization glyphs as their feature controls', () => {
    const actions = resolveAgentDockSuggestions(
      [asset],
      [],
      MemberRole.CREATOR,
    );
    const { container } = render(
      <div>
        {actions.map((action) => (
          <span key={action.id}>{action.icon}</span>
        ))}
      </div>,
    );
    expect(container.querySelector('.lucide-post-card')).not.toBeNull();
    expect(
      container.querySelector('.lucide-message-square-text'),
    ).not.toBeNull();
    expect(container.querySelector('.lucide-folder-open')).not.toBeNull();
  });

  it('offers useful library actions with feature icons rather than brand-topic labels', () => {
    const actions = createLibraryDockSuggestions();
    expect(actions).toHaveLength(4);
    expect(actions.map((action) => action.label)).toEqual([
      'Find an asset',
      'Organize library',
      'Draft a post',
      'Review recent assets',
    ]);
    expect(
      actions.every(
        (action) => action.icon !== undefined && action.description,
      ),
    ).toBe(true);
  });
});
