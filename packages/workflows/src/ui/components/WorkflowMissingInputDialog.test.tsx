import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExecutionStore } from '../stores/execution';
import type { MissingInputRequest } from '../stores/execution/types';
import { WorkflowMissingInputDialog } from './WorkflowMissingInputDialog';

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) =>
    (key: string, values?: Record<string, string | number>) => {
      const copy: Record<string, string> = {
        'pages.workflows.inputForm.required': '{label} is required',
        'pages.workflows.inputForm.selectPlaceholder': 'Select {label}',
        'pages.workflows.missingInput.cancel': 'Cancel',
        'pages.workflows.missingInput.description':
          'This run needs a value for each input below.',
        'pages.workflows.missingInput.submit': 'Run with these inputs',
        'pages.workflows.missingInput.title': 'Required inputs are missing',
      };
      return Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replace(`{${name}}`, String(value)),
        copy[`${namespace}.${key}`] ?? key,
      );
    },
}));

// The store actions the dialog calls, recorded so tests read what happened.
const submitted: Record<string, unknown>[] = [];
let dismissCount = 0;
const submitMissingInputs = async (inputValues: Record<string, unknown>) => {
  submitted.push(inputValues);
};
const dismissMissingInputs = () => {
  dismissCount += 1;
};

const request: MissingInputRequest = {
  inputValues: {},
  missingInputs: [
    {
      description: 'Camera angle of the generated visual',
      label: 'Visual angle',
      name: 'visualAngle',
      type: 'text',
    },
    {
      label: 'Visual style',
      name: 'visualStyle',
      type: 'select',
      validation: { options: ['Cinematic', 'Flat'] },
    },
  ],
  target: { kind: 'selected' },
};

beforeEach(() => {
  submitted.length = 0;
  dismissCount = 0;
  useExecutionStore.setState({
    dismissMissingInputs,
    missingInputRequest: request,
    submitMissingInputs,
  });
});

describe('WorkflowMissingInputDialog', () => {
  it('renders nothing while no run is waiting for inputs', () => {
    useExecutionStore.setState({ missingInputRequest: null });

    render(<WorkflowMissingInputDialog />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks for exactly the inputs the run is missing', () => {
    render(<WorkflowMissingInputDialog />);

    expect(
      screen.getByRole('dialog', { name: 'Required inputs are missing' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /Visual angle/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Camera angle of the generated visual'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: /Visual style/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('does not run until every input has a value, and names what is empty', () => {
    render(<WorkflowMissingInputDialog />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Run with these inputs' }),
    );

    expect(screen.getByText('Visual angle is required')).toBeInTheDocument();
    expect(screen.getByText('Visual style is required')).toBeInTheDocument();
    expect(submitted).toEqual([]);
  });

  it('sends the entered values to run again', async () => {
    render(<WorkflowMissingInputDialog />);

    fireEvent.change(screen.getByRole('textbox', { name: /Visual angle/ }), {
      target: { value: ' low angle ' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: /Visual style/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Flat' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Run with these inputs' }),
    );

    await waitFor(() =>
      expect(submitted).toEqual([
        { visualAngle: 'low angle', visualStyle: 'Flat' },
      ]),
    );
    expect(dismissCount).toBe(0);
  });

  it('drops the run without sending anything when canceled', () => {
    render(<WorkflowMissingInputDialog />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(dismissCount).toBe(1);
    expect(submitted).toEqual([]);
  });
});
