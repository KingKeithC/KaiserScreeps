/* eslint-disable no-underscore-dangle */
import { CreepExtra } from 'Creep';
import { CreepRole } from 'roles/Role';

declare global {
  interface Memory {
    logLevelName?: string;
    logFormat?: string;
  }

  interface Console {
    logUnsafe(message: string): void;
  }
}

export enum LogLevel {
  DEBUG,
  VERBOSE,
  INFO,
  REPORT, // Like info, but without the header
  WARNING,
  ERROR,
  CRITICAL,
}

type FormatProperty =
  '<time>' | '<wrapped>' | '<level>' | '<msg>' | '<room>' | '<role>' | '<creep>' | '<creep>' | '<rate>' | string;
type Loggable = string | object | number | boolean | CreepExtra | Room | null | CreepRole | { toString(): string };
type LogArg = Partial<Record<FormatProperty, Loggable>>;

export interface LoggerOptions {
  format?: string;
  level?: LogLevel;
  formatArgs?: LogArg;
}

export class Logger<T extends Loggable> {
  static DefaultLogFormat = '<level> <room><role><creep>%(PadEnd:63): <msg>';
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
      case LogLevel.DEBUG:
        return 'DBUG';
      case LogLevel.VERBOSE:
        return 'VERB';
      case LogLevel.INFO:
        return 'INFO';
      case LogLevel.WARNING:
        return 'WARNING';
      case LogLevel.ERROR:
        return 'ERROR';
      case LogLevel.CRITICAL:
        return 'CRITICAL';
      default:
        return `UNKNOWN ${level}`;
    }
  }

  static NameToLevel(name?: string): LogLevel | null {
    switch (name) {
      case 'DBUG' || 'DEBUG' || 'D':
        return LogLevel.DEBUG;
      case 'VERB' || 'VERBOSE' || 'V':
        return LogLevel.VERBOSE;
      case 'INFO' || 'INFORMATION' || 'I':
        return LogLevel.INFO;
      case 'WARNING' || 'WARNING' || 'W':
        return LogLevel.WARNING;
      case 'ERROR' || 'ERR' || 'W':
        return LogLevel.ERROR;
      case 'CRITICAL' || 'CRIT' || 'C':
        return LogLevel.CRITICAL;
      default:
        return null;
    }
  }

  constructor(wrapped: T, opts?: LoggerOptions) {
    this._wrapped = wrapped;
    this._level = opts?.level ?? Logger.NameToLevel(Memory.logLevelName) ?? LogLevel.INFO;
    this._fmt = opts?.format ?? Memory.logFormat ?? Logger.DefaultLogFormat;
    this._commonArgs = opts?.formatArgs ?? {};
  }

  private GetFormatArgs(args: LogArg[]): Map<string, Loggable> {
    const formatArgs = new Map<string, Loggable>();
    formatArgs.set('<time>', Game.time);
    formatArgs.set('<room>', '');
    formatArgs.set('<creep>', '');
    formatArgs.set('<role>', '');
    formatArgs.set('<rate>', '');

    // Overwrite with common and provided args
    for (const [key, value] of Object.entries(this._commonArgs)) if (value !== undefined) formatArgs.set(key, value);

    for (const arg of args)
      for (const [key, value] of Object.entries(arg)) if (value !== undefined) formatArgs.set(key, value);

    return formatArgs;
  }

  private writeMessage(msg: string, unsafe = false, rate?: number): void {
    if (rate && Game.time % rate !== 0) return; // Do nothing if rate limited

    // Log the message to the console.
    if (unsafe) console.logUnsafe(msg);
    else console.log(msg);
  }

  EnableStructuredLogs = false;
  log(level: LogLevel, msg: string, ...args: LogArg[]): void {
    const formatArgs = this.GetFormatArgs(args);
    formatArgs.set('<level>', Logger.LevelToName(level));

    // If we have a creep but not a room, get the room from the creep
    if (typeof formatArgs.get('<room>') === 'object' && formatArgs.get('<room>') === '')
      formatArgs.set('<room>', (formatArgs.get('<creep>') as CreepExtra).AssignedRoom);

    // If we have a creep but not a role, get the role from the creep
    if (typeof formatArgs.get('<creep>') === 'object' && formatArgs.get('<role>') === '')
      formatArgs.set('<role>', (formatArgs.get('<creep>') as CreepExtra).role);

    if (this.EnableStructuredLogs) this.logStructured(level, msg, formatArgs);
    else this.logFlat(level, msg, formatArgs);
  }

  logStructured(level: LogLevel, msg: string, format: Map<string, Loggable>): void {
    // Delete empty/invalid format args
    for (const k of format.keys())
      if (format.get(k) === '' || format.get(k) === undefined || format.get(k) === null) format.delete(k);

    // Replace objects with their string identifiers
    if (typeof format.get('<creep>') === 'object') format.set('<creep>', (format.get('<creep>') as CreepExtra).name);
    if (typeof format.get('<role>') === 'object') format.set('<role>', (format.get('<role>') as CreepRole).name);
    if (typeof format.get('<room>') === 'object') format.set('<room>', (format.get('<room>') as Room).name);

    // !! Important - After this point, values inside formatArgs must be
    // primitive objects capable of being JSON.strinigified.
    // Custom objects like CreepExtra and CreepRole will cause loops in the JSON serializer.

    const cleanedFormatArgs: { [key: string]: Loggable } = {};
    for (const [k, v] of format.entries()) {
      let key = k;
      // Strip the "<" and ">" chars from the keys.
      if (key.startsWith('<')) key = key.slice(1);
      if (key.endsWith('>')) key = key.slice(0, -1);

      cleanedFormatArgs[key] = v;
    }
    this.writeMessage(JSON.stringify({ level: Logger.LevelToName(level), msg, ...cleanedFormatArgs }));
  }

  private interpolate(text: string, values: Map<string, Loggable>): string {
    return text.replace(/\$\{(\w+)\}/g, (_, key: string) => String(values.get(key) ?? `{${key}}`));
  }

  logFlat(level: LogLevel, msg: string, format: Map<string, Loggable>): void {
    if (level < this._level) {
      // Provided log level is too low for us to handle
      return;
    } else if (level === LogLevel.REPORT) {
      // REPORT messages are filtered by level, but not formatted aside from colour, so log it directly, and don't rate limit it.
      this.writeMessage(`<span style="color: DodgerBlue">${msg}</span>`, true, undefined);
      return;
    }

    format.set('<msg>', this.interpolate(msg, format));

    // Render the FormatProperties into the log line.
    let finalLine = this._fmt;
    for (const [key, value] of format.entries()) finalLine = finalLine.replace(key, String(value));

    // TODO - Replace ${...} placeholders in the msg as well with values from `format`

    // Handle padding specifiers
    const paddingMatch = '%(';
    const maxAttempts = 5;
    let attempts = 0;
    const paddingInfo = [];
    while (finalLine.includes(paddingMatch) && attempts < maxAttempts) {
      // This shouldn't be needed anymore, but during development
      // this loop burned out the CPU a few times, so it is left here as a guard.
      attempts++;

      const starts = finalLine.indexOf(paddingMatch);
      const sectionToAction = finalLine.slice(0, starts);
      const paramEnd = finalLine.indexOf(')', starts);
      const rest = finalLine.slice(paramEnd + 1);
      const params = finalLine.slice(starts + 2, paramEnd);
      const action = params.split(':')[0];
      const qty = Number.parseInt(params.split(':')[1], 10);

      paddingInfo.push({ attempts, starts, sectionToAction, paramEnd, rest, params, action, qty, finalLine });

      // Pad the line and assign back to the string we will print
      if (action === 'PadStart') finalLine = sectionToAction.padStart(qty) + rest;
      else if (action === 'PadEnd') finalLine = sectionToAction.padEnd(qty) + rest;
    }

    // Attach error info if we had problems padding the message
    // This may also break if a message has more than `paddingInfo` sections, or stray `paddingMatch` spans.
    if (attempts >= maxAttempts)
      finalLine += `\n +++ The following info may help debug a padding error: ${JSON.stringify(paddingInfo)}`;

    // Log it.
    if (level !== LogLevel.ERROR) this.writeMessage(finalLine, false, format.get('<rate>') as number);
    else this.writeMessage(`<span style="color: red">${finalLine}</span>`, true, format.get('<rate>') as number);
  }

  debug(msg: string, ...args: LogArg[]): void {
    this.log(LogLevel.DEBUG, msg, ...args);
  }
  verbose(msg: string, ...args: LogArg[]): void {
    this.log(LogLevel.VERBOSE, msg, ...args);
  }
  info(msg: string, ...args: LogArg[]): void {
    this.log(LogLevel.INFO, msg, ...args);
  }
  report(msg: string, ...args: LogArg[]): void {
    this.log(LogLevel.REPORT, msg, ...args);
  }
  warn(msg: string, ...args: LogArg[]): void {
    this.log(LogLevel.WARNING, msg, ...args);
  }
  error(error: Error, ...args: LogArg[]): void {
    this.log(LogLevel.ERROR, error.stack ?? error.toString(), ...args);
  }
  crit(msg: string, ...args: LogArg[]): void {
    this.log(LogLevel.CRITICAL, msg, ...args);
  }

  static debug(msg: string, ...args: LogArg[]): void {
    new Logger(Logger).debug(msg, ...args);
  }
  static verbose(msg: string, ...args: LogArg[]): void {
    new Logger(Logger).verbose(msg, ...args);
  }
  static info(msg: string, ...args: LogArg[]): void {
    new Logger(Logger).info(msg, ...args);
  }
  static report(msg: string, ...args: LogArg[]): void {
    new Logger(Logger).report(msg, ...args);
  }
  static warn(msg: string, ...args: LogArg[]): void {
    new Logger(Logger).warn(msg, ...args);
  }
  static error(error: Error, ...args: LogArg[]): void {
    new Logger(Logger).error(error, ...args);
  }
  static crit(msg: string, ...args: LogArg[]): void {
    new Logger(Logger).crit(msg, ...args);
  }
}
