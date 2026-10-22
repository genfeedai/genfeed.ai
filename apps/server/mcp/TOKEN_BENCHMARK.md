# MCP token benchmark

Measured 2026-10-22 for #7815 against baseline
`187958af5025807e272e67609e6255516445477b` (after #7810).

## Input definitions follow-up (#7832)

Measured 2026-10-22 against baseline
`2bf370d76585f64c65ec55181adb1c3a0a10b5f7`, which already contains the output
optimization below. Same fixture version, catalogs and pinned tokenizer.

| Payload | UTF-8 bytes before → after | o200k_base before → after | Reduction | cl100k_base before → after | Reduction |
| --- | ---: | ---: | ---: | ---: | ---: |
| Default input-only (27 tools) | 41,002 → 34,483 | 9,170 → 7,837 | 14.54% | 8,805 → 7,471 | 15.15% |
| Full input-only (144 tools) | 122,326 → 108,995 | 27,527 → 24,930 | 9.43% | 26,244 → 23,644 | 9.91% |
| Default complete descriptors | 51,376 → 44,857 | 11,915 → 10,582 | 11.19% | 11,459 → 10,125 | 11.64% |
| Full complete descriptors | 176,544 → 163,213 | 41,908 → 39,311 | 6.20% | 40,187 → 37,587 | 6.47% |

The MCP adapter applies reviewed concise wording to 55 tool descriptions and
144 parameter-description occurrences (102 unique rewrites), and omits 105
annotations (84 unique strings) that only repeat a field name or enum. It never
truncates arbitrary documentation. A changed canonical description falls back to
its original wording; appended guidance and dynamic pricing are retained. Other
surfaces keep their canonical definitions. Unknown annotations remain untouched.
The API parity test checks canonical agent definitions verbatim and compares MCP
parameter validation independently of client-facing descriptions.

The benchmark checks that only tool descriptions and schema `description`
annotations differ. Tool order/count, names, arguments, required fields, defaults,
enums, bounds, formats, patterns, references, permissions, annotations, credit and
mutation metadata, and output schemas compare identically. Every result fixture,
including text, structured data and combined payload, is identical. Schema
traversal preserves literal `description` fields in defaults, examples and enum
objects, and user properties named `description`.

Standalone tools retain brand selection, quote/approval/credit guidance, media
type/operation restrictions, exact-prompt receipts, public publishing effects and
recovery steps. Tests exercise these contracts without paid generation or
production calls. Keeping validation and useful guidance accounts for the
remaining size; these measurements do not establish an absolute token minimum.
The input-only client projection includes name, description and parameters,
excluding outputSchema/metadata; it is not captured client billing or a live
agent-task success evaluation.

To reproduce this follow-up, export the existing fixture from the baseline and
candidate using the dependency setup and commands below (no fixture copy is
needed). Compare with the stricter input-documentation mode:

```bash
python3 -m unittest discover -s scripts/mcp -p 'test_token_benchmark_contract.py' -v
node_modules/.cache/mcp-tokenizer/bin/python scripts/mcp/compare-token-benchmarks.py \
  "$TOKEN_BASELINE/node_modules/.cache/mcp-tokens/payloads.json" \
  "$TOKEN_CURRENT/node_modules/.cache/mcp-tokens/payloads.json" \
  --change input-documentation
```

Without the flag, the historical output-only mode remains strict about input
definitions. Input-documentation mode additionally rejects changed output schemas
or result fixtures. Contract tests reject renamed/removed tools, changed roles,
prices, constraints and instance data, including Python's `True == 1` pitfall.

## Original output optimization (#7815)

## Contract

Tools advertise the compact data, object-data, media or discovery schema selected
from their canonical definition. The transport validates the selected schema and
the existing standard envelope. Standard approval/error/card fields remain
extensible; tool-specific provider payloads are not assigned invented schemas.
Validators are compiled once per family, rather than on each call.

Generic display summaries preview five items, ten visible fields per object and
240 characters per string, with a 2,400-character text budget and explicit notices
when details are omitted. Nested diagnostic messages remain visible. Whole links
and generation harness receipts are intentional exceptions: an OAuth link or
the exact submitted generation prompt must remain usable. Complete structured
data, IDs, cursors, citations, native blocks and widget metadata are retained.

## Results

Counts use **tiktoken 0.12.0**, compact sorted-key UTF-8 JSON and fixture version 1
from `src/shared/utils/tool-token-benchmark.spec.ts`. The catalogs include complete
emitted descriptors, including metadata; the default fixture has 27 canonical
tools before role filtering and the full fixture has 144. Actual connections can
advertise fewer tools. These are deterministic fixture measurements, not live
traffic averages or billed Codex/Claude token counts. Clients differ in tool
serialization, caching and which result fields enter model context. Image/audio
model costs and client protocol wrappers are excluded. Result fixtures measure
the shared dataToolResult output before client-specific card decoration.

Combined results count **both readable text and complete structured content**:

| Payload | UTF-8 bytes before → after | o200k_base before → after | Reduction | cl100k_base before → after |
| --- | ---: | ---: | ---: | ---: |
| Default catalog | 58,380 → 51,376 | 13,654 → 11,915 | 12.74% | 13,020 → 11,459 |
| Full catalog | 214,876 → 176,544 | 51,424 → 41,908 | 18.50% | 48,716 → 40,187 |
| Default input-only control | 41,002 → 41,002 | 9,170 → 9,170 | 0% | 8,805 → 8,805 |
| Full input-only control | 122,326 → 122,326 | 27,527 → 27,527 | 0% | 26,244 → 26,244 |
| Post list, combined | 70,959 → 37,899 | 12,880 → 6,916 | 46.30% | 12,877 → 6,894 |
| Brand list, combined | 135,778 → 70,212 | 23,903 → 12,379 | 48.21% | 23,901 → 12,357 |
| Analytics, combined | 153,950 → 71,438 | 40,705 → 18,565 | 54.39% | 40,678 → 18,519 |
| Article detail, combined | 20,912 → 10,820 | 3,498 → 1,818 | 48.03% | 3,497 → 1,817 |
| Small failure status, combined | 170 → 170 | 38 → 38 | 0% | 38 → 38 |
| Generation receipt, combined | 3,013 → 3,013 | 535 → 535 | 0% | 532 → 532 |

For clients including only readable text, the large fixture reductions are
91.80% (posts), 95.37% (brands), 97.46% (analytics), and 96.05% (article), using
o200k_base. Their complete structured payloads compare identically before/after;
the comparison tool refuses changed structured data or unrelated catalog changes.
Full structured data therefore remains a lower bound on result size. Existing
section selectors, limits and pagination are still useful for narrower reads.

The input-only controls project each descriptor to function name, description
and input parameters. They are unchanged: a client that omits outputSchema from
its model prompt gets no model-input token savings from the schema change.
These controls represent a client projection, not captured Codex billing.

## Reproduce

Prepare existing baseline and candidate checkouts using the normal workspace
dependency setup. Use a Python 3.9–3.14 runtime for the pinned tokenizer. Set
`TOKEN_BASELINE` and `TOKEN_CURRENT` to those checkout directories and
`TOKEN_CANDIDATE` to the candidate Git ref; run the following from the candidate.
The exporter is copied to the baseline because it did not exist there. Its
fixtures and public formatter APIs are identical on both runs.

```bash
TOKEN_FIXTURE=apps/server/mcp/src/shared/utils/tool-token-benchmark.spec.ts
git show "$TOKEN_CANDIDATE:$TOKEN_FIXTURE" > "$TOKEN_BASELINE/$TOKEN_FIXTURE"

(cd "$TOKEN_BASELINE" && \
  MCP_TOKEN_BENCHMARK_OUTPUT="$TOKEN_BASELINE/node_modules/.cache/mcp-tokens/payloads.json" \
  bun run --cwd apps/server/mcp test src/shared/utils/tool-token-benchmark.spec.ts)
(cd "$TOKEN_CURRENT" && \
  MCP_TOKEN_BENCHMARK_OUTPUT="$TOKEN_CURRENT/node_modules/.cache/mcp-tokens/payloads.json" \
  bun run --cwd apps/server/mcp test src/shared/utils/tool-token-benchmark.spec.ts)

python3 -m venv node_modules/.cache/mcp-tokenizer
node_modules/.cache/mcp-tokenizer/bin/pip install --only-binary=:all: tiktoken==0.12.0
node_modules/.cache/mcp-tokenizer/bin/python scripts/mcp/compare-token-benchmarks.py \
  "$TOKEN_BASELINE/node_modules/.cache/mcp-tokens/payloads.json" \
  "$TOKEN_CURRENT/node_modules/.cache/mcp-tokens/payloads.json"
```

The comparison prints every fixture's bytes and both tokenizer counts, including
unchanged structured-only controls. It performs no model calls, generation,
publishing or production writes. The tokenizer is benchmark tooling only and
does not add a server dependency. CI regressions cover schema size, summary
budgets, diagnostic/link preservation, invalid results, and real SDK transport.
