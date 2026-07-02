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

// Field names whose values are secrets and must never be logged verbatim, and a
// value pattern for VerifyAX keys that may be embedded in free-text messages.
const SECRET_KEY_RE =
  /^(authorization|api[-_]?key|token|secret|basic_password|password|x-verifyax-api-key)$/i;
const SECRET_VALUE_RE = /sk-ver-[a-z0-9]+-[A-Za-z0-9._-]+/g;

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(SECRET_VALUE_RE, 'sk-ver-***');
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === 'object') {
    return redactFields(value as Record<string, unknown>);
  }
  return value;
}

/** Redact secret-bearing fields and any embedded API keys from a log payload. */
export function redactFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = SECRET_KEY_RE.test(key) ? '[redacted]' : redactValue(value);
  }
  return out;
}

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
    const safeFields = fields ? redactFields(fields) : undefined;
    const entry = { level: entryLevel, time: new Date().toISOString(), msg, ...safeFields };
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
