import { describe, expect, it } from 'vitest';
import type {
  AspectRatio,
  BaseTrendNodeData,
  CheckFrequency,
  ContentPreference,
  ContentStyle,
  ContentType,
  InspirationStyle,
  MixMode,
  TrendPlatform,
  TrendType,
} from './trend-shared';

describe('trend-shared types', () => {
  it('should allow BaseTrendNodeData with required fields', () => {
    const data: BaseTrendNodeData = {
      label: 'Test',
      status: 'idle',
    };
    expect(data.status).toBe('idle');
    expect(data.label).toBe('Test');
  });
});
