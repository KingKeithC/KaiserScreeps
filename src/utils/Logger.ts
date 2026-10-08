

export enum LogLevel {
  DEBUG,
  VERBOSE,
  INFO,
}

export class Logger<T extends Object> {
  private _wrapped: T;
  private _level: LogLevel;

  constructor(wrapped: T, logLevel: LogLevel = LogLevel.INFO) {
    this._wrapped = wrapped;
    this._level = logLevel;
  }

  Log(level: LogLevel, msg: string): void {
    if (this._level <= level)
      console.log(this._wrapped.toString() + msg);
  }

  LogDebug(msg: string): void { this.Log(LogLevel.DEBUG, msg); }
  LogInfo(msg: string): void { this.Log(LogLevel.INFO, msg); }
  LogVerbose(msg: string): void { this.Log(LogLevel.VERBOSE, msg); }

}
