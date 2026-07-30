import { beforeEach, describe, expect, it } from 'vitest';
import { useBrandInterviewDraftStore } from './brand-interview-draft.store';

describe('useBrandInterviewDraftStore', () => {
  beforeEach(() => {
    useBrandInterviewDraftStore.setState({ byBrandId: {} });
    localStorage.clear();
  });

  it('stores and returns a draft answer per brand field', () => {
    const { setAnswer, getAnswer } = useBrandInterviewDraftStore.getState();

    setAnswer('brand-1', 'messagingPillars', 'clarity\nproof');

    expect(getAnswer('brand-1', 'messagingPillars')).toBe('clarity\nproof');
    expect(getAnswer('brand-1', 'other')).toBe('');
    expect(getAnswer('brand-2', 'messagingPillars')).toBe('');
  });

  it('clears a single field without wiping other fields', () => {
    const store = useBrandInterviewDraftStore.getState();
    store.setAnswer('brand-1', 'tone', 'confident');
    store.setAnswer('brand-1', 'style', 'plain');
    store.clearAnswer('brand-1', 'tone');

    expect(store.getAnswer('brand-1', 'tone')).toBe('');
    expect(
      useBrandInterviewDraftStore.getState().getAnswer('brand-1', 'style'),
    ).toBe('plain');
  });

  it('clears an entire brand draft', () => {
    const store = useBrandInterviewDraftStore.getState();
    store.setAnswer('brand-1', 'tone', 'confident');
    store.setAnswer('brand-2', 'tone', 'other');
    store.clearBrand('brand-1');

    expect(store.getAnswer('brand-1', 'tone')).toBe('');
    expect(
      useBrandInterviewDraftStore.getState().getAnswer('brand-2', 'tone'),
    ).toBe('other');
  });
});
