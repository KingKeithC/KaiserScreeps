import { all } from "lodash";


export enum LogLevel {
  DEBUG,
  VERBOSE,
  INFO,
  WARNING,
  CRITICAL,
}

type FormatProperty = "<date>" | "<wrapped>" | "<level>" | "<msg>";
type Loggable = string | { toString(): string; };
type LogArg = [FormatProperty, Loggable];

export class Logger<T extends Loggable> {
  private readonly _wrapped: T;
  private readonly _fmt: string;
  private _level: LogLevel;
  private _extraArgs: LogArg[];

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
    logLevel: LogLevel = LogLevel.INFO,
    fmt: string = "<level> <wrapped> <msg>",
    ...args: LogArg[]
  ) {
    this._wrapped = wrapped;
    this._level = logLevel;
    this._fmt = fmt;
    this._extraArgs = args;
  }

  log(level: LogLevel, msg: string, ...args: LogArg[]): void {
    if (level < this._level) return;

    // Create a map of formatting arguments for the log message
    const formatArgs = new Map<FormatProperty, Loggable>();
    formatArgs.set("<level>", level);
    formatArgs.set("<date>", Game.time);
    formatArgs.set("<wrapped>", this._wrapped);
    formatArgs.set("<msg>", msg);
    for (const [key, value] of args)
      formatArgs.set(key, value);

    // Render the formating arguments into a single log line
    var finalLine = this._fmt;
    for (const [key, value] of formatArgs.entries())
      finalLine = finalLine.replace(key, value.toString());

    // Log it.
    console.log(finalLine);
  }

  debug(msg: string, ...args: LogArg[]): void { this.log(LogLevel.DEBUG, msg, ...args); }
  info(msg: string, ...args: LogArg[]): void { this.log(LogLevel.INFO, msg, ...args); }
  verbose(msg: string, ...args: LogArg[]): void { this.log(LogLevel.VERBOSE, msg, ...args); }
  warn(msg: string, ...args: LogArg[]): void { this.log(LogLevel.WARNING, msg, ...args); }
  crit(msg: string, ...args: LogArg[]): void { this.log(LogLevel.CRITICAL, msg, ...args); }
}
