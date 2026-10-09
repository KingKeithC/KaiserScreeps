
declare global {
  interface Memory {
    logLevelName?: string,
    logFormat?: string,
  }
}

export enum LogLevel {
  DEBUG,
  VERBOSE,
  INFO,
  REPORT, // Like info, but without the header
  WARNING,
  CRITICAL,
}

type FormatProperty = "<date>" | "<time>" | "<wrapped>" | "<level>" | "<msg>" | "<room>" | "<role>" | "<creep>";
type Loggable = string | number | { toString(): string; };
type LogArg = Partial<Record<FormatProperty, Loggable>>;

export interface LoggerOptions {
  format?: string,
  level?: LogLevel,
  formatArgs?: LogArg;
}

export class Logger<T extends Loggable> {
  static DefaultLogFormat: string = "<level> <room><role><creep>%(PadEnd:63): <msg>";
  static DefaultLogLevelName: string = Logger.LevelToName(LogLevel.INFO);

  private readonly _wrapped: T;
  private readonly _fmt: string;
  private _level: LogLevel;
  private _commonArgs: LogArg;

  // Return 4 chars for the INFO and lower levels
  // Return longer for the higher levels (not by much though)
  // I like my logs lined up, so having the higher levels be longer
  // will break that consistency for longer lines and make problems more obvious.
  static LevelToName(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return "DBUG";
      case LogLevel.VERBOSE: return "VERB";
      case LogLevel.INFO: return "INFO";
      case LogLevel.WARNING: return "WARNING";
      case LogLevel.CRITICAL: return "CRITICAL";
      default: return `UNKNOWN ${level}`;
    }
  }

  static NameToLevel(name?: string): LogLevel | null {
    switch (name) {
      case "DBUG": return LogLevel.DEBUG;
      case "VERB": return LogLevel.VERBOSE;
      case "INFO": return LogLevel.INFO;
      case "WARNING": return LogLevel.WARNING;
      case "CRITICAL": return LogLevel.CRITICAL;
      default: return null;
    }
  }

  constructor(
    wrapped: T,
    opts?: LoggerOptions,
  ) {
    this._wrapped = wrapped;
    this._level = opts?.level ?? Logger.NameToLevel(Memory.logLevelName) ?? LogLevel.INFO;
    this._fmt = opts?.format ?? Memory.logFormat ?? Logger.DefaultLogFormat;
    this._commonArgs = opts?.formatArgs ?? {};
  }

  private GetFormatArgs(args: LogArg[]): Map<string, Loggable> {
    const formatArgs = new Map<string, Loggable>();
    formatArgs.set("<date>", Game.time);
    formatArgs.set("<time>", Game.time);
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
    if (level < this._level) {
      // Provided log level is too low for us to handle
      return;
    } else if (level === LogLevel.REPORT) {
      // REPORT messages are filtered by level, but not formatted, so log it directly.
      console.log(msg);
      return;
    }

    // Needs to be formatted

    // Get the format args for this instance, and populate with immediate log level and message params.
    const formatArgs = this.GetFormatArgs(args);
    formatArgs.set("<level>", Logger.LevelToName(level));
    formatArgs.set("<msg>", msg);

    // If both creep and role are set, then unset role
    if (formatArgs.get("<creep>") && formatArgs.get("<role>"))
      formatArgs.set("<role>", ""); // The creep names contain the role name, so it's redundant

    // Render the FormatProperties into the log line.
    var finalLine = this._fmt;
    for (const [key, value] of formatArgs.entries()) finalLine = finalLine.replace(key, value.toString());

    // Handle padding specifiers
    const paddingMatch = "%(";
    const maxAttempts = 5;
    var attempts = 0;
    var paddingInfo = [];
    while (finalLine.includes(paddingMatch) && attempts < maxAttempts) {
      // This shouldn't be needed anymore, but during development
      // this loop burned out the CPU a few times, so it is left here as a guard.
      attempts++;

      const starts = finalLine.indexOf(paddingMatch);
      const sectionToAction = finalLine.slice(0, starts);
      const paramEnd = finalLine.indexOf(')', starts);
      const rest = finalLine.slice(paramEnd + 1);
      const params = finalLine.slice(starts + 2, paramEnd);
      const action = params.split(":")[0];
      const qty = Number.parseInt(params.split(":")[1]);

      paddingInfo.push({
        attempts: attempts,
        starts: starts,
        sectionToAction: sectionToAction,
        paramEnd: paramEnd,
        rest: rest,
        params: params,
        action: action,
        qty: qty,
        finalLine: finalLine,
      });

      // Pad the line and assign back to the string we will print
      if (action === "PadStart")
        finalLine = sectionToAction.padStart(qty) + rest;
      else if (action === "PadEnd")
        finalLine = sectionToAction.padEnd(qty) + rest;
    }

    // Attach error info if we had problems padding the message
    // This may also break if a message has more than `paddingInfo` sections, or stray `paddingMatch` spans.
    if (attempts >= maxAttempts) finalLine += `\n +++ The following info may help debug a padding error: ${JSON.stringify(paddingInfo)}`;

    // Log it.
    console.log(finalLine);
  }

  debug(msg: string, ...args: LogArg[]): void { this.log(LogLevel.DEBUG, msg, ...args); }
  verbose(msg: string, ...args: LogArg[]): void { this.log(LogLevel.VERBOSE, msg, ...args); }
  info(msg: string, ...args: LogArg[]): void { this.log(LogLevel.INFO, msg, ...args); }
  report(msg: string, ...args: LogArg[]): void { this.log(LogLevel.REPORT, msg, ...args); }
  warn(msg: string, ...args: LogArg[]): void { this.log(LogLevel.WARNING, msg, ...args); }
  crit(msg: string, ...args: LogArg[]): void { this.log(LogLevel.CRITICAL, msg, ...args); }
}
