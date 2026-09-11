packages: props

`GenerationSetupTriggerProps` and `GenerationSetupPopoverProps` add an optional
`isTypeCommitted`. A surface sets it when it has already committed to
`setup.values.type` even though the type field is still agent-owned. The agent
composer does this when a model, aspect ratio, or output count locks it into
direct media. The trigger then shows that type instead of "Agent".

The prop is optional and defaults to `false`, so existing hosts (Studio) keep
their current labels and do not need to change.
