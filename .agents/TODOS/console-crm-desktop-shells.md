# Console/CRM Desktop Shells TODO

- [ ] Create desktop shell spec artifacts
  Verify: `test -f .agents/SPECS/console-crm-desktop-shells.md && test -f .agents/TODOS/console-crm-desktop-shells.md && test -f .agents/DECISIONS/console-crm-desktop-shells.md`

- [ ] Scaffold `../console/apps/desktop`
  Verify: `cd ../console && bun run --filter @genfeedai/admin-desktop build`

- [ ] Scaffold `../crm/apps/desktop`
  Verify: `cd ../crm && bun run --filter @crm/desktop build`

- [ ] Add root desktop scripts for console and crm
  Verify: `cd ../console && bun run | grep desktop && cd ../crm && bun run | grep desktop`

- [ ] Document dev/prod shell URLs and constraints
  Verify: `rtk rg -n "desktop" ../console/apps/desktop ../crm/apps/desktop ../console/package.json ../crm/package.json`
