import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from '../stores/settingsStore';
import { useWorkflowStore } from '../stores/workflow';
import { SaveIndicator } from './SaveIndicator';

beforeEach(() => {
  useSettingsStore.setState({ autoSaveEnabled: true });
  useWorkflowStore.setState({ isDirty: false, isSaving: false });
});

describe('SaveIndicator', () => {
  it('shows Saved when clean and toggles auto-save on click', () => {
    render(<SaveIndicator />);

    fireEvent.click(screen.getByText('Saved'));
    expect(useSettingsStore.getState().autoSaveEnabled).toBe(false);
  });

  it('shows the off state and re-enables auto-save on click', () => {
    useSettingsStore.setState({ autoSaveEnabled: false });
    render(<SaveIndicator />);

    fireEvent.click(screen.getByText('Auto-save off'));
    expect(useSettingsStore.getState().autoSaveEnabled).toBe(true);
  });

  it('shows Saving while a save is in flight', () => {
    useWorkflowStore.setState({ isSaving: true });
    render(<SaveIndicator />);
    expect(screen.getByText('Saving…')).toBeInTheDocument();
  });

  it('shows Unsaved when dirty', () => {
    useWorkflowStore.setState({ isDirty: true });
    render(<SaveIndicator />);
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
  });

  it('prop overrides win over store state', () => {
    useWorkflowStore.setState({ isDirty: true, isSaving: true });
    render(<SaveIndicator isDirty={false} isSaving={false} />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('pill variant renders the pill classes', () => {
    useWorkflowStore.setState({ isSaving: true });
    render(<SaveIndicator variant="pill" />);
    expect(screen.getByText('Saving…').parentElement?.className).toContain(
      'rounded-full',
    );
  });
});
