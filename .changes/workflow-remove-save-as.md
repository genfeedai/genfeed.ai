packages: @genfeedai/workflows

Remove the editor's Save As feature: `SaveAsDialog` is deleted from
`./ui` and `./ui/toolbar`, and `Toolbar`'s `onSaveAs` prop (`ToolbarProps`)
is gone. The library's Duplicate action already covers making an editable
copy of a workflow, and Save As routed through a second, redundant clone
path that duplicated the empty-save and wrong-brand bugs fixed in #4664.

Consumers that imported `SaveAsDialog` or passed `onSaveAs` to `Toolbar`
must drop both — there is no replacement API, since the feature is gone.
