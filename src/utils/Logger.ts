

export enum LogLevel {
  DEBUG,
  VERBOSE,
  INFO,
  WARNING,
  CRITICAL,
}

export class Logger<T extends Object> {
  private readonly _wrapped: T;
  private readonly _fmt: string;
  private _level: LogLevel;

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
    fmt: string = "<wrapped> <level> <msg>",
  ) {
    this._wrapped = wrapped;
    this._level = logLevel;
    this._fmt = fmt;
  }

  log(level: LogLevel, msg: string): void {
    if (level < this._level) return;
    var finalLine = "";
    finalLine = finalLine.replace("<date>", Game.time.toString());
    finalLine = finalLine.replace("<wrapped>", this._wrapped.toString());
    finalLine = finalLine.replace("<level>", Logger.LevelToName(level));
    finalLine = finalLine.replace("<msg>", msg);
    console.log(finalLine);
  }

  debug(msg: string): void { this.log(LogLevel.DEBUG, msg); }
  info(msg: string): void { this.log(LogLevel.INFO, msg); }
  verbose(msg: string): void { this.log(LogLevel.VERBOSE, msg); }
  warn(msg: string): void { this.log(LogLevel.WARNING, msg); }
  crit(msg: string): void { this.log(LogLevel.CRITICAL, msg); }
}
