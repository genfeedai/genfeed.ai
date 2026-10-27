# B2B playbooks

A playbook is a preset that carries its own structure: format, hook formula,
shot list, reference slots with roles, evaluation criteria and allowed models.
It is stored in the `presets` table (`config.playbook`), at platform, org or
brand scope, so an admin edits it through the preset API without a redeploy.
The API rejects a playbook that does not match `b2bPlaybookSchema`.

- Contract: `packages/contracts/src/api-types/contracts/b2b-playbook.contract.ts`
- Seeded catalog (six formats): `packages/contracts/src/constants/b2b-playbooks.constant.ts`,
  reconciled by `StudioPresetSeedService`. Persisted edits win over the seed.
- Compiler: `compileB2bPlaybook` turns attached assets into `@ImageN` /
  `@VideoN` / `@AudioN` tokens with the role of the slot each one fills, and
  appends pattern-playbook hooks so text and media agree on the angle.

Reference slots stay per playbook. Defaults come from the brand's own scanned
Library assets (`brand-scan`) or an ingredient the user picks (`library`).
Third-party media is never a default start frame.

Not built yet: the picker UI that shows the slots, the scan-to-slot default
fill (depends on the website scan import), and routing the compiled tokens
into each provider payload.
