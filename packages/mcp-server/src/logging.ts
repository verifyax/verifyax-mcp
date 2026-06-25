// Structured JSON logging to stderr (CLAUDE.md decision 8).
// stdout is reserved for the MCP protocol, so logs must never go there.
// Level is controlled by VERIFYAX_MCP_LOG_LEVEL (debug | info | warn | error | silent).

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99,
};

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

export interface LoggerOptions {
  level?: LogLevel;
  /** Sink for a finished log line (without trailing newline). Defaults to stderr. */
  write?: (line: string) => void;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? resolveLevelFromEnv();
  const write = options.write ?? ((line) => process.stderr.write(`${line}\n`));

  const emit = (entryLevel: Exclude<LogLevel, 'silent'>, msg: string, fields?: LogFields): void => {
    if (LEVEL_WEIGHT[entryLevel] < LEVEL_WEIGHT[level]) {
      return;
    }
    const entry = { level: entryLevel, time: new Date().toISOString(), msg, ...fields };
    write(JSON.stringify(entry));
  };

  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
  };
}

function resolveLevelFromEnv(): LogLevel {
  const raw = (process.env.VERIFYAX_MCP_LOG_LEVEL ?? 'info').toLowerCase();
  return isLogLevel(raw) ? raw : 'info';
}

function isLogLevel(value: string): value is LogLevel {
  return (
    value === 'debug' ||
    value === 'info' ||
    value === 'warn' ||
    value === 'error' ||
    value === 'silent'
  );
}
