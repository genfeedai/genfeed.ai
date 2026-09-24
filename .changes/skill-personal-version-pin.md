packages: @genfeedai/contracts

Resolved runtime skills now carry the immutable version id and content hash that were executed. A generation context can pass those pins back so a retry uses the same version after a later edit or activation.
