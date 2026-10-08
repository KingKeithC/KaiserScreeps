export enum LogLevel {
  DEBUG,
  VERBOSE,
  INFO,
  WARNING,
  CRITICAL,
}

type FormatProperty = "<date>" | "<wrapped>" | "<level>" | "<msg>" | "<room>" | "<role>" | "<creep>";
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
    this._fmt = opts?.format ?? "<level><room><role><creep>%(PadEnd:60): <msg>";
    this._commonArgs = opts?.formatArgs ?? {};
  }

  private GetFormatArgs(args: LogArg[]): Map<string, Loggable> {
    const formatArgs = new Map<string, Loggable>();
    formatArgs.set("<date>", Game.time);
    formatArgs.set("<wrapped>", this._wrapped);
    formatArgs.set("<room>", "");
    formatArgs.set("<creep>", "");
    formatArgs.set("<role>", "");

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

    // If both creep and role are set, then unset role
    if (formatArgs.has("<creep>") && formatArgs.has("<role>"))
      formatArgs.set("<role>", ""); // The creep names contain the role name, so it's redundant

    // Render the FormatProperties into the log line.
    var finalLine = this._fmt;
    for (const [key, value] of formatArgs.entries()) finalLine = finalLine.replace(key, value.toString());

    // Handle padding specifiers
    const maxAttempts = 5;
    var attempts = 0;
    while (finalLine.includes('%') && attempts < maxAttempts) {
      // This shouldn't be needed anymore, but during development
      // this loop burned out the CPU a few times, so it is left here as a guard.
      attempts++;

      const starts = finalLine.indexOf('%');
      const sectionToAction = finalLine.slice(0, starts);
      const paramEnd = finalLine.indexOf(')', starts);
      const rest = finalLine.slice(paramEnd + 1);
      const params = finalLine.slice(starts + 2, paramEnd);
      const action = params.split(":")[0];
      const qty = Number.parseInt(params.split(":")[1]);

      // console.log(JSON.stringify({
      //   attempts: attempts,
      //   starts: starts,
      //   sectionToAction: sectionToAction,
      //   paramEnd: paramEnd,
      //   rest: rest,
      //   params: params,
      //   action: action,
      //   qty: qty,
      //   finalLine: finalLine,
      // }));

      // Pad the line and assign back to the string we will print
      if (action === "PadStart")
        finalLine = sectionToAction.padStart(qty) + rest;
      else if (action === "PadEnd")
        finalLine = sectionToAction.padEnd(qty) + rest;
    }

    // Log it.
    console.log(finalLine);
  }

  debug(msg: string, ...args: LogArg[]): void { this.log(LogLevel.DEBUG, msg, ...args); }
  info(msg: string, ...args: LogArg[]): void { this.log(LogLevel.INFO, msg, ...args); }
  verbose(msg: string, ...args: LogArg[]): void { this.log(LogLevel.VERBOSE, msg, ...args); }
  warn(msg: string, ...args: LogArg[]): void { this.log(LogLevel.WARNING, msg, ...args); }
  crit(msg: string, ...args: LogArg[]): void { this.log(LogLevel.CRITICAL, msg, ...args); }
}
