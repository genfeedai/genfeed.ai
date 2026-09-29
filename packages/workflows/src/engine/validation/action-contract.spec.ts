import { describe, expect, it } from 'vitest';
import {
  ActionContractCompilationError,
  type ActionContractProvenance,
  ActionContractValidationError,
  compileActionContract,
  isActionContractFailureMessage,
} from './action-contract';

const PROVENANCE: ActionContractProvenance = {
  nodeId: 'node-transform',
  runId: 'run-42',
  workflowId: 'workflow-youtube-long-form',
  workflowVersionId: 'workflow-version-7',
};

function compileStrictContract() {
  return compileActionContract('long-form.transform-text', {
    inputSchema: {
      additionalProperties: false,
      properties: {
        options: {
          additionalProperties: false,
          properties: {
            includeHeadings: { type: 'boolean' },
          },
          required: ['includeHeadings'],
          type: 'object',
        },
        outputType: {
          enum: ['linkedin', 'x-article', 'newsletter'],
          type: 'string',
        },
        transcript: { minLength: 1, type: 'string' },
      },
      required: ['transcript', 'outputType', 'options'],
      type: 'object',
    },
    outputSchema: {
      additionalProperties: false,
      properties: {
        body: { minLength: 1, type: 'string' },
        title: { minLength: 1, type: 'string' },
      },
      required: ['title', 'body'],
      type: 'object',
    },
  });
}

describe('compileActionContract', () => {
  it('validates concrete nested input and output contracts', () => {
    const contract = compileStrictContract();

    expect(() =>
      contract.validateInput(
        {
          options: { includeHeadings: true },
          outputType: 'linkedin',
          transcript: 'A complete transcript',
        },
        PROVENANCE,
      ),
    ).not.toThrow();
    expect(() =>
      contract.validateOutput(
        { body: 'Article body', title: 'Article title' },
        PROVENANCE,
      ),
    ).not.toThrow();
  });

  it('reports the action and execution provenance without exposing values', () => {
    const contract = compileStrictContract();
    const secret = 'private-transcript-that-must-not-appear';

    expect(() =>
      contract.validateInput(
        {
          options: { includeHeadings: 'yes' },
          outputType: 'unsupported',
          transcript: secret,
        },
        PROVENANCE,
      ),
    ).toThrowError(ActionContractValidationError);

    try {
      contract.validateInput(
        {
          options: { includeHeadings: 'yes' },
          outputType: 'unsupported',
          transcript: secret,
        },
        PROVENANCE,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ActionContractValidationError);
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain('action=long-form.transform-text');
      expect(message).toContain('workflow=workflow-youtube-long-form');
      expect(message).toContain('version=workflow-version-7');
      expect(message).toContain('run=run-42');
      expect(message).toContain('node=node-transform');
      expect(message).toContain('$.options.includeHeadings');
      expect(message).toContain('$.outputType');
      expect(message).not.toContain(secret);
      expect(message).not.toContain('unsupported');
    }
  });

  it('rejects unconstrained and open object contracts at compilation', () => {
    expect(() =>
      compileActionContract('open.action', {
        inputSchema: {},
        outputSchema: { type: 'string' },
      }),
    ).toThrowError(ActionContractCompilationError);

    expect(() =>
      compileActionContract('open.action', {
        inputSchema: {
          properties: { prompt: { type: 'string' } },
          type: 'object',
        },
        outputSchema: { type: 'string' },
      }),
    ).toThrow('must set additionalProperties');
  });

  it('allows a typed map without allowing arbitrary values', () => {
    const contract = compileActionContract('metadata.action', {
      inputSchema: {
        additionalProperties: { type: 'string' },
        type: 'object',
      },
      outputSchema: { type: 'null' },
    });

    expect(() =>
      contract.validateInput({ locale: 'en', tone: 'direct' }, PROVENANCE),
    ).not.toThrow();
    expect(() => contract.validateInput({ retries: 2 }, PROVENANCE)).toThrow(
      '$.retries: must be string',
    );
  });

  it('fails closed when Ajv cannot compile a malformed schema', () => {
    expect(() =>
      compileActionContract('malformed.action', {
        inputSchema: { type: 'unknown-json-type' },
        outputSchema: { type: 'null' },
      }),
    ).toThrowError(ActionContractCompilationError);
  });
});

describe('isActionContractFailureMessage', () => {
  it('matches the message of every contract error the engine can throw', () => {
    const contract = compileStrictContract();
    const thrown = (run: () => void): string => {
      try {
        run();
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
      throw new Error('expected the contract to reject');
    };

    expect(
      isActionContractFailureMessage(
        thrown(() => contract.validateInput({}, PROVENANCE)),
      ),
    ).toBe(true);
    expect(
      isActionContractFailureMessage(
        thrown(() => contract.validateOutput({}, PROVENANCE)),
      ),
    ).toBe(true);
    expect(
      isActionContractFailureMessage(
        new ActionContractCompilationError('a.b', 'input', 'bad').message,
      ),
    ).toBe(true);
  });

  it('matches a contract failure flattened into a graph-run error string', () => {
    expect(
      isActionContractFailureMessage(
        'Nodes failed: finalize: Action contract input validation failed [action=x workflow=w version=v run=r node=n] $.a: bad',
      ),
    ).toBe(true);
  });

  it('does not match transient or unrelated failures', () => {
    expect(isActionContractFailureMessage('Nodes failed: infer: 503')).toBe(
      false,
    );
    expect(isActionContractFailureMessage('Action contract mentioned')).toBe(
      false,
    );
  });
});
