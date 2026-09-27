import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { describe, expect, it } from 'vitest';
import {
  getStrategyPlatforms,
  getStrategyTopics,
  normalizeDate,
  normalizeModel,
  requireAgentType,
} from './content-engine-parsing.util';

describe('content-engine-parsing.util', () => {
  describe('requireAgentType', () => {
    it('returns the agent type when present', () => {
      expect(requireAgentType('specialist')).toBe('specialist');
    });

    it('throws when the strategy has no agent type', () => {
      expect(() => requireAgentType(undefined)).toThrow(
        'Agent strategy type is missing',
      );
      expect(() => requireAgentType('')).toThrow(
        'Agent strategy type is missing',
      );
    });
  });

  describe('normalizeModel', () => {
    it('passes a string through', () => {
      expect(normalizeModel('openai/gpt-5.6-terra')).toBe(
        'openai/gpt-5.6-terra',
      );
    });

    it('normalizes null to undefined', () => {
      expect(normalizeModel(null)).toBeUndefined();
      expect(normalizeModel(undefined)).toBeUndefined();
    });
  });

  describe('normalizeDate', () => {
    it('passes a Date through', () => {
      const date = new Date('2026-01-01T00:00:00.000Z');
      expect(normalizeDate(date)).toBe(date);
    });

    it('parses a valid date string or number', () => {
      expect(normalizeDate('2026-01-01T00:00:00.000Z')).toEqual(
        new Date('2026-01-01T00:00:00.000Z'),
      );
      expect(normalizeDate(1700000000000)).toEqual(new Date(1700000000000));
    });

    it('returns null for falsy, invalid, or unsupported values', () => {
      expect(normalizeDate(null)).toBeNull();
      expect(normalizeDate(undefined)).toBeNull();
      // 0 is falsy, so it short-circuits the same as null/undefined — this
      // matches the original private method's behavior verbatim.
      expect(normalizeDate(0)).toBeNull();
      expect(normalizeDate('not-a-date')).toBeNull();
      expect(normalizeDate({})).toBeNull();
    });
  });

  describe('getStrategyTopics / getStrategyPlatforms', () => {
    it('returns the strategy arrays when present', () => {
      const strategy = {
        platforms: ['twitter'],
        topics: ['ai'],
      } as unknown as AgentStrategyDocument;

      expect(getStrategyTopics(strategy)).toEqual(['ai']);
      expect(getStrategyPlatforms(strategy)).toEqual(['twitter']);
    });

    it('defaults to an empty array when absent', () => {
      const strategy = {} as unknown as AgentStrategyDocument;

      expect(getStrategyTopics(strategy)).toEqual([]);
      expect(getStrategyPlatforms(strategy)).toEqual([]);
    });
  });
});
