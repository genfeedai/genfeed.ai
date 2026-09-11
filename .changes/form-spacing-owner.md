packages: ui

Add `Form` (`@genfeedai/ui/primitives/form`), a form that owns the vertical
rhythm between its fields. `spacing="default"` stacks fields with `gap-4`,
`spacing="section"` stacks page sections with `gap-6`, and `spacing="none"`
leaves layout to the caller for forms that are only a submit boundary.

`ModalActions` no longer applies a default `mt-6`, and the modal body now stacks
its blocks with `gap-4`. `DialogContent` is a `flex flex-col gap-4` stack, and
`DialogHeader` and `DialogFooter` drop their `mb-4` and `mt-4`; buttons rendered
directly in `DialogContent` stretch to its width, so put them in `DialogFooter`. A host that renders `ModalActions` outside a `Form`,
the modal body, or another stacked container must space it from that container
rather than with a margin on the footer.
