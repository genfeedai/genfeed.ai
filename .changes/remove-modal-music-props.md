packages: @genfeedai/props

Remove `ModalMusicProps` from `modals/modal.props`. Background music moved
from video generation to the Studio editor (#4683); `ModalMusic` and its lazy
wrapper were confirmed unused (never opened) and deleted alongside their only
prop type.
