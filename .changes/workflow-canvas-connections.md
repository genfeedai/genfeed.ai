packages: workflows

Resolve workflow ports from the same core, action, or selected-model definition
used to render the node. Connection validation and connected-node insertion now
support the current action catalog and its semantic port types. Pass node data
when resolving action or model-specific handles; legacy core nodes retain their
existing port IDs.

Connection-drop UI state accepts the current catalog's port type strings. Node
cards expose port labels and reserve enough height for their handles. No database
or environment migration is required.
