import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentWorkflowStore } from '../store';
import type { Evidence } from '../types';
import { VerificationPanel } from './VerificationPanel';

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    content: '12 passed, 0 failed',
    id: 'e-1',
    passed: true,
    title: 'Unit tests',
    type: 'test_result',
    ...overrides,
  };
}

function setVerifyingState(evidence: Evidence[]): void {
  useAgentWorkflowStore.setState({
    isLocked: false,
    messages: [],
    phase: 'verifying',
    transitions: [],
    verificationEvidence: evidence,
  });
}

describe('VerificationPanel', () => {
  beforeEach(() => {
    setVerifyingState([]);
  });

  it('shows the waiting state with no evidence and no counter', () => {
    render(<VerificationPanel />);

    expect(
      screen.getByText('Waiting for verification evidence from the agent…'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/passed$/)).not.toBeInTheDocument();
  });

  it('counts passing evidence in the badge', () => {
    setVerifyingState([
      makeEvidence(),
      makeEvidence({ id: 'e-2', passed: false, title: 'Lint' }),
    ]);

    render(<VerificationPanel />);

    expect(screen.getByText('1/2 passed')).toBeInTheDocument();
    expect(screen.getByText('Unit tests')).toBeInTheDocument();
    expect(screen.getByText('Lint')).toBeInTheDocument();
  });

  it('renders every evidence type without crashing', () => {
    setVerifyingState([
      makeEvidence({ id: 'e-1', title: 'Tests', type: 'test_result' }),
      makeEvidence({ id: 'e-2', title: 'Shot', type: 'screenshot' }),
      makeEvidence({ id: 'e-3', title: 'Log', type: 'log' }),
      makeEvidence({ id: 'e-4', title: 'Diff', type: 'diff' }),
    ]);

    render(<VerificationPanel />);

    expect(screen.getByText('4/4 passed')).toBeInTheDocument();
  });

  it('hides the accept action while any evidence fails', () => {
    setVerifyingState([makeEvidence({ passed: false })]);

    render(<VerificationPanel />);

    expect(
      screen.queryByRole('button', { name: 'Accept & mark complete' }),
    ).not.toBeInTheDocument();
  });

  it('advances to complete when the accept action is used', () => {
    setVerifyingState([makeEvidence()]);

    render(<VerificationPanel />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Accept & mark complete' }),
    );

    expect(useAgentWorkflowStore.getState().phase).toBe('complete');
  });
});
