packages: @genfeedai/props

Add `forceModuleChrome` to `ContainerProps`. Pages pass it to keep
`SectionTopbar` mounted while transient state (loading, empty list) toggles
whether `right`/`tabs`/`leading` are defined, instead of flip-flopping into
the classic layout.
