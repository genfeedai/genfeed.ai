packages: contracts, props, helpers, pages, ui

Equivalent icon component props now use the shared `IconComponent` alias from
`@genfeedai/contracts/types/icon`. Consumers may import that alias instead of
redeclaring `ComponentType<{ className?: string }>`; runtime rendering is unchanged.
Contracts reference the alias through local source imports to support cold builds.
The trending-topic icon contract also permits a `style` prop and remains distinct.
