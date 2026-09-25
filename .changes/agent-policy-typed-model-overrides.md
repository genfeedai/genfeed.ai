packages: @genfeedai/props

`AdvancedRoutingCardProps` now takes `thinkingModelOptions`,
`generationModelOptions`, and `reviewModelOptions` instead of a single
`modelOptions` list. Thinking and review are text catalog keys; generation is
image/video. Hosts must pass the three filtered lists.
