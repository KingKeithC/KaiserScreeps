import "roles";
import { RoomRole } from "roles/Role";
import { RoomExtra } from "Room";
import profiler from "screeps-profiler";
import { ErrorMapper } from "utils/ErrorMapper";
import { Logger } from "utils/Logger";


declare global {
  interface Memory {
    globalEnableProfiling: boolean,
    globalEnableErrorMapper: boolean,
  }
}

declare const global: {
  Colony: Colony;
};

export class Colony {

  private readonly log = new Logger(this);

  private WrapWithProfiling(lambda: (() => void)): () => void {
    if (!Memory.globalEnableProfiling) return lambda;

    // Register Profiler only if enabled.
    profiler.registerClass(ErrorMapper, "ErrorMapper");
    profiler.registerClass(RoomExtra, "RoomExtra");
    profiler.registerClass(RoomRole, "RoomRole");
    for (const roleType of RoomRole.Registry.values())
      profiler.registerClass(roleType, roleType.RoleName);
    profiler.registerClass(Colony, "Colony");
    profiler.enable();
    return () => profiler.wrap(lambda);
  }

  private WrapWithErrorMapper(lambda: (() => void)): () => void {
    if (!Memory.globalEnableErrorMapper) return lambda;
    return ErrorMapper.wrapLoop(lambda);
  }

  get Rooms() { return Memory.rooms ?? {}; }
  get Creeps() { return Memory.creeps ?? {}; }

  get LogFormat() { return Memory.logFormat ?? Logger.DefaultLogFormat; }
  get LogLevelName() { return Memory.logLevelName ?? Logger.DefaultLogLevelName; }
  get GlobalEnableProfiling() { return Memory.globalEnableProfiling ?? true; }
  get GlobalEnableErrorMapper() { return Memory.globalEnableErrorMapper ?? true; }

  set LogFormat(value) { Memory.logFormat = value; }
  set LogLevelName(value) { Memory.logLevelName = value; }
  set GlobalEnableProfiling(value) { Memory.globalEnableProfiling = value; }
  set GlobalEnableErrorMapper(value) { Memory.globalEnableErrorMapper = value; }

  // This function is rarely invoked (hundreds of ticks between); when globals reset or code is uploaded.
  // What is returned from this is cached, but is subject to periodic refreshes.
  // Also if too much data is cached, it may cause GC to run more frequently.
  public GetMainLoop(): () => void {
    this.log.crit(`GLOBALS RESET | Profiling Configured: ${this.GlobalEnableProfiling}, ErrorMapper: ${this.GlobalEnableErrorMapper}`);
    global.Colony = this; // Accessible as `Colony.whatever()` in the console.
    return this.WrapWithProfiling(this.WrapWithErrorMapper(this.MainLoop.bind(this)));
  }

  // This is the effective loop function invoked each tick.
  private MainLoop(): void {
    // Try to generate a pixel if we can
    if (Game.cpu.bucket >= 10000) {
      const res = Game.cpu.generatePixel();
      if (res === OK) this.log.info(`!!! Generated a pixel :)`);
    }

    // Get all rooms I can access
    const Rooms: RoomExtra[] = Object.values(Game.rooms).map(c => new RoomExtra(c));
    for (const m of Rooms) m.OnTick();
  };

  SaySomething(): void { this.log.crit("Something"); }
}
