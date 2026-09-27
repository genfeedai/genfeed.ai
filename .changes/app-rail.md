packages: @genfeedai/props

`ui/app-switcher.props` is replaced by `ui/app-rail.props` (`AppRailProps`,
`AppRailBadge`, `AppRailNavigationTarget`; `variant` removed, `onNavigate`
added). `AppLayoutProps` gains an optional `railComponent` slot for the
persistent app rail.
