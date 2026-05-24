#!/usr/bin/env sh
set -eu

# Node warns when both variables are set. FORCE_COLOR already wins, so drop
# NO_COLOR only in that conflicting case.
if [ -n "${FORCE_COLOR:-}" ]; then
  unset NO_COLOR
fi

case " ${NODE_OPTIONS:-} " in
  *" --disable-warning=ExperimentalWarning "*) ;;
  *)
    NODE_OPTIONS="${NODE_OPTIONS:-} --disable-warning=ExperimentalWarning"
    export NODE_OPTIONS
    ;;
esac

exec "$@"
