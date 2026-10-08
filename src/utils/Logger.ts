export enum LogLevel {
  DEBUG,
  VERBOSE,
  INFO,
  WARNING,
  CRITICAL,
}

type FormatProperty = "<date>" | "<wrapped>" | "<level>" | "<msg>" | "<room>" | "<creep>";
type Loggable = string | number | { toString(): string; };
type LogArg = Partial<Record<FormatProperty, Loggable>>;

export interface LoggerOptions {
  format?: string,
  level?: LogLevel,
  formatArgs?: LogArg;
}

export class Logger<T extends Loggable> {
  private readonly _wrapped: T;
  private readonly _fmt: string;
  private _level: LogLevel;
  private _commonArgs: LogArg;

  static LevelToName(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return "DEBUG";
      case LogLevel.VERBOSE: return "VERBOSE";
      case LogLevel.INFO: return "INFO";
      case LogLevel.WARNING: return "WARNING";
      case LogLevel.CRITICAL: return "CRITICAL";
      default: return "!UNK";
    }
  }

  constructor(
    wrapped: T,
    opts?: LoggerOptions,
  ) {
    this._wrapped = wrapped;
    this._level = opts?.level ?? LogLevel.INFO;
    this._fmt = opts?.format ?? "<level><room><creep>: <msg>";
    this._commonArgs = opts?.formatArgs ?? {};
  }

  private GetFormatArgs(args: LogArg[]): Map<string, Loggable> {
    const formatArgs = new Map<string, Loggable>();
    formatArgs.set("<date>", Game.time);
    formatArgs.set("<wrapped>", this._wrapped);
    formatArgs.set("<room>", "");
    formatArgs.set("<creep>", "");

    // Overwrite with common and provided args
    for (const [key, value] of Object.entries(this._commonArgs)) formatArgs.set(key, value);
    for (const arg of args)
      for (const [key, value] of Object.entries(arg)) formatArgs.set(key, value);

    return formatArgs;
  }


  log(level: LogLevel, msg: string, ...args: LogArg[]): void {
    if (level < this._level) return;

    // Get the format args for this instance, and populate with immediate log level and message params.
    const formatArgs = this.GetFormatArgs(args);
    formatArgs.set("<level>", Logger.LevelToName(level));
    formatArgs.set("<msg>", msg);

    // Render the formating arguments into a single log line
    var finalLine = this._fmt;
    for (const [key, value] of formatArgs.entries()) finalLine = finalLine.replace(key, value.toString());

    // Log it.
    console.log(finalLine);
  }

  debug(msg: string, ...args: LogArg[]): void { this.log(LogLevel.DEBUG, msg, ...args); }
  info(msg: string, ...args: LogArg[]): void { this.log(LogLevel.INFO, msg, ...args); }
  verbose(msg: string, ...args: LogArg[]): void { this.log(LogLevel.VERBOSE, msg, ...args); }
  warn(msg: string, ...args: LogArg[]): void { this.log(LogLevel.WARNING, msg, ...args); }
  crit(msg: string, ...args: LogArg[]): void { this.log(LogLevel.CRITICAL, msg, ...args); }
}
