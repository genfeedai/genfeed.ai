# ADR: DCO, No CLA, `ee/` Maintainer-Only

## Status

Accepted · 2026-08-16

## Decision

Contributions are accepted under the Developer Certificate of Origin (`Signed-off-by:` trailer,
checked by the DCO app). There is **no CLA**. Contributor PRs may not modify `ee/`; that tree is
maintainer-only, enforced by CODEOWNERS and review.

## Trade-off

The maintainer gives up the ability to relicense contributed AGPL code or fold it into the
commercial `ee/` licence later; in exchange contributors face no legal paperwork and the AGPL
root stays clean. Because `ee/` never receives outside code, its commercial licence needs no
assignment.

## Guardrail

Introducing a CLA after external contributions have landed would require every past contributor's
consent — decide once, here.
