const SOURCEMAP_WARNING_FRAGMENT = 'points to missing source files';
const SOURCEMAP_WARNING_PREFIX = 'Sourcemap for';

function isSuppressedWarning(firstArg: unknown) {
  return (
    typeof firstArg === 'string' &&
    firstArg.includes(SOURCEMAP_WARNING_PREFIX) &&
    firstArg.includes(SOURCEMAP_WARNING_FRAGMENT)
  );
}

export function installVitestWarningFilter() {
  const consoleWithState = console as typeof console & {
    __genfeedVitestWarningFilterInstalled__?: boolean;
  };

  if (consoleWithState.__genfeedVitestWarningFilterInstalled__) {
    return;
  }

  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.warn = (...args: Parameters<typeof console.warn>) => {
    if (isSuppressedWarning(args[0])) {
      return;
    }

    originalWarn(...args);
  };

  console.error = (...args: Parameters<typeof console.error>) => {
    if (isSuppressedWarning(args[0])) {
      return;
    }

    originalError(...args);
  };

  consoleWithState.__genfeedVitestWarningFilterInstalled__ = true;
}

export function createVitestWarningLogger() {
  return {
    clearScreen() {},
    error(msg: string) {
      console.error(msg);
    },
    hasErrorLogged() {
      return false;
    },
    info(msg: string) {
      console.log(msg);
    },
    warn(msg: string) {
      if (isSuppressedWarning(msg)) {
        return;
      }

      console.warn(msg);
    },
    warnOnce(msg: string) {
      if (isSuppressedWarning(msg)) {
        return;
      }

      console.warn(msg);
    },
  };
}
