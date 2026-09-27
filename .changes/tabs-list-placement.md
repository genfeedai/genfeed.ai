packages: @genfeedai/props

`TabsProps` gains an optional `listClassName` that places the tab list inside
its root (defaults to `ml-auto`, right-aligned). The shared list style no longer
hard-codes `ml-auto`; callers that render `TabsList` directly and want it
right-aligned pass `ml-auto` themselves.
