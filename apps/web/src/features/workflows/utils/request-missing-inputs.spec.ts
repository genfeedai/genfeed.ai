import { useExecutionStore } from '@genfeedai/workflows/ui/stores';
import { beforeEach, describe, expect, it } from 'vitest';
import { requestMissingWorkflowInputs } from './request-missing-inputs';

const missingInputError = {
  data: {
    errors: [
      {
        code: 'WORKFLOW_MISSING_INPUT',
        meta: {
          missingInputs: [
            { label: 'Topic', name: 'topic', type: 'text' },
            { label: 'Tone', name: 'tone', type: 'text' },
          ],
        },
        status: '400',
      },
    ],
  },
  message: 'Missing required workflow input(s): topic, tone',
  status: 400,
};

describe('requestMissingWorkflowInputs', () => {
  beforeEach(() => {
    useExecutionStore.setState({ missingInputRequest: null });
  });

  it('opens the recovery request for the inputs the API listed', () => {
    const handled = requestMissingWorkflowInputs(
      missingInputError,
      { audience: 'devs' },
      async () => {},
    );

    const request = useExecutionStore.getState().missingInputRequest;
    expect(handled).toBe(true);
    expect(request?.missingInputs.map((input) => input.name)).toEqual([
      'topic',
      'tone',
    ]);
    expect(request?.inputValues).toEqual({ audience: 'devs' });
  });

  it('runs again with the entered values merged over the refused ones', async () => {
    const sent: Record<string, unknown>[] = [];
    requestMissingWorkflowInputs(
      missingInputError,
      { audience: 'devs' },
      async (values) => {
        sent.push(values);
      },
    );

    await useExecutionStore
      .getState()
      .submitMissingInputs({ tone: 'dry', topic: 'launch' });

    expect(sent).toEqual([{ audience: 'devs', tone: 'dry', topic: 'launch' }]);
    expect(useExecutionStore.getState().missingInputRequest).toBeNull();
  });

  it('sends nothing when the user cancels', () => {
    const sent: Record<string, unknown>[] = [];
    requestMissingWorkflowInputs(missingInputError, {}, async (values) => {
      sent.push(values);
    });

    useExecutionStore.getState().dismissMissingInputs();

    expect(sent).toEqual([]);
    expect(useExecutionStore.getState().missingInputRequest).toBeNull();
  });

  it('leaves any other failure to the caller', () => {
    const handled = requestMissingWorkflowInputs(
      { data: { errors: [{ code: 'SOMETHING_ELSE' }] }, status: 500 },
      {},
      async () => {},
    );

    expect(handled).toBe(false);
    expect(useExecutionStore.getState().missingInputRequest).toBeNull();
  });
});
