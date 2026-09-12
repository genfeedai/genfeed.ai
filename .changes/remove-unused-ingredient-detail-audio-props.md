packages: @genfeedai/props

Remove `IngredientDetailAudioProps` from `content/ingredient.props`. The
interface had zero consumers in the repo and its only field (`showWaveform`)
was unused — flagged by the #4682 code audit while fixing Library audio
playback. No migration needed; nothing imported this type.
