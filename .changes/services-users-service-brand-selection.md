packages: @genfeedai/services

`UsersService.patchMeBrand` drops its `Partial<IBrand>` body parameter (the
server ignored it, deriving everything from the URL brand id and the
authenticated user). `UsersService.clearMeBrandSelection` is removed, and
`patchMe`'s param type drops the `selectedBrandId` union — a member always
has a current brand now, so there is no "clear selection" state (#5219).
