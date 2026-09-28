import { AgentType, Platform } from '@genfeedai/contracts';
import { PUBLISH_PLATFORMS } from '@genfeedai/contracts/constants';
import {
  LinkedinIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { MessageSquareText, Newspaper, ScrollText } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import {
  AGENT_PLATFORM_OPTIONS,
  AGENT_TYPE_DEFAULTS,
  AGENT_TYPE_ICON_COMPONENTS,
  AGENT_TYPE_LABELS,
  AGENT_TYPE_OPTIONS,
  getAgentTypeIcon,
  getAgentTypeLabel,
} from './agent-type-display';

describe('agent-type-display', () => {
  it('includes publish platforms followed by every preset platform without duplicates', () => {
    expect(AGENT_PLATFORM_OPTIONS).toEqual([
      Platform.YOUTUBE,
      Platform.TIKTOK,
      Platform.INSTAGRAM,
      Platform.TWITTER,
      Platform.LINKEDIN,
      Platform.WORDPRESS,
      Platform.FACEBOOK,
    ]);
    expect(AGENT_PLATFORM_OPTIONS.slice(0, PUBLISH_PLATFORMS.length)).toEqual(
      PUBLISH_PLATFORMS.map(({ platform }) => platform),
    );
    for (const { platforms } of Object.values(AGENT_TYPE_DEFAULTS)) {
      expect(AGENT_PLATFORM_OPTIONS).toEqual(expect.arrayContaining(platforms));
    }
    expect(new Set(AGENT_PLATFORM_OPTIONS).size).toBe(
      AGENT_PLATFORM_OPTIONS.length,
    );
  });

  it('covers every AgentType with a label, icon, and default budget', () => {
    for (const type of Object.values(AgentType)) {
      expect(AGENT_TYPE_LABELS[type].length).toBeGreaterThan(0);
      expect(AGENT_TYPE_ICON_COMPONENTS[type]).toBeTruthy();
      expect(AGENT_TYPE_DEFAULTS[type].defaultBudget).toBeGreaterThan(0);
      expect(AGENT_TYPE_DEFAULTS[type].platforms.length).toBeGreaterThan(0);
    }
  });

  it('exposes one option per AgentType and falls back for unknown values', () => {
    expect(AGENT_TYPE_OPTIONS).toHaveLength(Object.values(AgentType).length);
    expect(getAgentTypeLabel(AgentType.X_CONTENT)).toBe('X Content');
    expect(getAgentTypeLabel('not-a-type')).toBe('not-a-type');
    expect(getAgentTypeLabel(undefined)).toBe('');
    expect(getAgentTypeIcon(undefined)).toBe(
      AGENT_TYPE_ICON_COMPONENTS[AgentType.GENERAL],
    );
    expect(getAgentTypeIcon('not-a-type')).toBe(
      AGENT_TYPE_ICON_COMPONENTS[AgentType.GENERAL],
    );
  });

  it('depicts the output type, never the platform brand', () => {
    const brandIcons = new Set<unknown>([
      LinkedinIcon,
      XTwitterIcon,
      YoutubeIcon,
    ]);

    for (const type of Object.values(AgentType)) {
      expect(brandIcons.has(AGENT_TYPE_ICON_COMPONENTS[type])).toBe(false);
    }
    expect(AGENT_TYPE_ICON_COMPONENTS[AgentType.X_CONTENT]).toBe(
      MessageSquareText,
    );
    expect(AGENT_TYPE_ICON_COMPONENTS[AgentType.LINKEDIN_CONTENT]).toBe(
      Newspaper,
    );
    expect(AGENT_TYPE_ICON_COMPONENTS[AgentType.YOUTUBE_SCRIPT]).toBe(
      ScrollText,
    );
  });
});
