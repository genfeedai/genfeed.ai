import { describe, expect, it } from 'vitest';
import { getActionDefinition } from '../action-registry';
import {
  getKnowledgeToolActionContract,
  KNOWLEDGE_WORKFLOW_MUTATION_ACTION_IDS,
  KNOWLEDGE_WORKFLOW_READ_ACTION_IDS,
} from './knowledge-tool-action-contracts';

describe('knowledge tool action contracts', () => {
  it('publishes closed envelopes for every Knowledge workflow action', () => {
    for (const id of [
      ...KNOWLEDGE_WORKFLOW_READ_ACTION_IDS,
      ...KNOWLEDGE_WORKFLOW_MUTATION_ACTION_IDS,
    ]) {
      const contract = getKnowledgeToolActionContract(id);
      expect(contract, id).toBeDefined();
      expect(getActionDefinition(id)?.outputSchema).toEqual(
        expect.objectContaining({
          additionalProperties: false,
          type: 'object',
        }),
      );
    }
  });

  it('requires query on search and sourceId on read', () => {
    expect(getActionDefinition('search_knowledge')?.inputSchema).toEqual(
      expect.objectContaining({
        required: expect.arrayContaining(['query']),
      }),
    );
    expect(getActionDefinition('read_knowledge_source')?.inputSchema).toEqual(
      expect.objectContaining({
        required: expect.arrayContaining(['sourceId']),
      }),
    );
  });
});
