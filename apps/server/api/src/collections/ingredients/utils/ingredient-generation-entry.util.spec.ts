import { runWithActionOrigin } from '@api/action-origin/action-origin.context';
import {
  ingredientGenerationUpdateTargets,
  preserveIngredientGenerationEntry,
  stampIngredientGenerationEntry,
} from '@api/collections/ingredients/utils/ingredient-generation-entry.util';
import { ActionOrigin, IngredientOrigin } from '@genfeedai/contracts';
import {
  GenerationEntryAttribution,
  GenerationEntryChannel,
} from '@genfeedai/contracts/interfaces/content/generation-entry.interface';

const web = {
  channel: GenerationEntryChannel.WEB,
  attribution: GenerationEntryAttribution.CLIENT_REPORTED,
};
const mcp = {
  channel: GenerationEntryChannel.MCP,
  attribution: GenerationEntryAttribution.SERVER_VERIFIED,
};
describe('ingredient generation entry persistence', () => {
  it('stamps the initiating invocation and overwrites a caller entry while preserving compiler evidence', () => {
    const providerData = {
      generationBrief: { compiler: 'v1' },
      generationEntry: mcp,
    };
    expect(
      runWithActionOrigin(
        { origin: ActionOrigin.UI, generationEntry: web },
        () =>
          stampIngredientGenerationEntry(
            IngredientOrigin.GENERATED,
            providerData,
          ),
      ),
    ).toEqual({ generationBrief: { compiler: 'v1' }, generationEntry: web });
    expect(providerData.generationEntry).toEqual(mcp);
  });
  it('keeps uninstrumented new generation unknown and does not label imports', () => {
    expect(
      stampIngredientGenerationEntry(IngredientOrigin.GENERATED, {}),
    ).toEqual({
      generationEntry: { channel: 'unknown', attribution: 'unknown' },
    });
    expect(
      stampIngredientGenerationEntry(IngredientOrigin.IMPORTED, {
        generationEntry: mcp,
        capture: 'original',
      }),
    ).toEqual({ capture: 'original' });
  });
  it('preserves the original entry through a completion metadata replacement, without backfilling history', () => {
    expect(
      runWithActionOrigin(
        { origin: ActionOrigin.UI, generationEntry: web },
        () =>
          preserveIngredientGenerationEntry(
            { generationEntry: web, completed: true },
            { generationEntry: mcp },
          ),
      ),
    ).toEqual({ completed: true, generationEntry: mcp });
    expect(
      preserveIngredientGenerationEntry(
        { generationEntry: web, completed: true },
        {},
      ),
    ).toEqual({ completed: true });
  });
  it('keeps separate original entries for bulk replacements and retains grouped status updates', () => {
    const rows = [
      {
        id: 'a',
        organizationId: 'org',
        providerData: { generationEntry: web },
      },
      {
        id: 'b',
        organizationId: 'org',
        providerData: { generationEntry: mcp },
      },
      { id: 'platform', organizationId: null, providerData: null },
    ];
    const targets = ingredientGenerationUpdateTargets(rows, true, true);
    expect(
      targets.map((row) => [
        row.id,
        preserveIngredientGenerationEntry({ done: true }, row.providerData),
      ]),
    ).toEqual([
      ['a', { done: true, generationEntry: web }],
      ['b', { done: true, generationEntry: mcp }],
    ]);
    expect(ingredientGenerationUpdateTargets(rows, false, true)).toEqual([
      { organizationId: 'org', id: undefined, providerData: undefined },
    ]);
  });
});
