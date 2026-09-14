packages: contexts, props

Global modal configuration and provider/context prop types now live in
`@genfeedai/props/modals/global-modals.props`. The existing provider module still
re-exports `GlobalModalsContextValue` and `GlobalModalsProviderProps`, so callers
can migrate imports without changing their runtime behavior. Upload, gallery,
illustration and delete configurations share the named contracts in that module.
