packages: ui

Add `Form` (`@genfeedai/ui/primitives/form`), a form that owns the vertical
rhythm between its fields. `spacing="default"` stacks fields with `gap-4`,
`spacing="section"` stacks page sections with `gap-6`, and `spacing="none"`
leaves layout to the caller for forms that are only a submit boundary.

`ModalActions` no longer applies a default `mt-6`, and the modal body now stacks
its blocks with `gap-4`. A host that renders `ModalActions` outside a `Form`,
the modal body, or another stacked container must space it from that container
rather than with a margin on the footer.
