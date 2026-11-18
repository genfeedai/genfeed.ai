import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useResetOnChange } from './use-reset-on-change';

function useForm(source: { label: string; note: string }) {
  const [label, setLabel] = useState(source.label);
  const [note, setNote] = useState(source.note);
  useResetOnChange([source.label, source.note], () => {
    setLabel(source.label);
    setNote(source.note);
  });
  return { label, note, setLabel, setNote };
}

describe('useResetOnChange', () => {
  it('keeps local edits while the dependencies are unchanged', () => {
    const { result, rerender } = renderHook(({ source }) => useForm(source), {
      initialProps: { source: { label: 'a', note: 'n' } },
    });

    act(() => result.current.setLabel('edited'));
    rerender({ source: { label: 'a', note: 'n' } });

    expect(result.current.label).toBe('edited');
  });

  it('resets every state value when one dependency changes', () => {
    const { result, rerender } = renderHook(({ source }) => useForm(source), {
      initialProps: { source: { label: 'a', note: 'n' } },
    });

    act(() => {
      result.current.setLabel('edited');
      result.current.setNote('edited note');
    });
    rerender({ source: { label: 'a', note: 'm' } });

    expect(result.current).toMatchObject({ label: 'a', note: 'm' });
  });

  it('resets again on a later change', () => {
    const { result, rerender } = renderHook(({ source }) => useForm(source), {
      initialProps: { source: { label: 'a', note: 'n' } },
    });

    rerender({ source: { label: 'b', note: 'n' } });
    act(() => result.current.setLabel('edited'));
    rerender({ source: { label: 'c', note: 'n' } });

    expect(result.current.label).toBe('c');
  });
});
