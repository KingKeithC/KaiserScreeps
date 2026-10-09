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


export class Colony {

  private readonly log = new Logger(this);

  WrapWithProfiling(lambda: (() => void)): () => void {
    Memory.globalEnableProfiling ??= true;
    if (!Memory.globalEnableProfiling) return lambda;

    // Register Profiler only if enabled.

    profiler.registerClass(ErrorMapper, "ErrorMapper");
    profiler.registerClass(RoomExtra, "RoomExtra");
    profiler.registerClass(RoomRole, "RoomRole");
    for (const roleType of RoomRole.Registry.values()) {
      profiler.registerClass(roleType, roleType.RoleName);
    }
    profiler.registerClass(Colony, "Colony");
    profiler.enable();

    return () => profiler.wrap(lambda);
  }

  WrapWithErrorMapper(lambda: (() => void)): () => void {
    Memory.globalEnableErrorMapper ??= true;
    if (!Memory.globalEnableErrorMapper) return lambda;
    return ErrorMapper.wrapLoop(lambda);
  }

  GetMainLoop(): () => void { return this.WrapWithProfiling(this.WrapWithErrorMapper(this.MainLoop.bind(this))); }

  MainLoop(): void {
    Memory.rooms ??= {};
    Memory.creeps ??= {};

    // Try to generate a pixel if we can
    if (Game.cpu.bucket >= 10000) {
      const res = Game.cpu.generatePixel();
      if (res === OK) this.log.info(`!!! Generated a pixel :)`);
    }

    // Get all rooms I can access
    const Rooms: RoomExtra[] = Object.values(Game.rooms).map(c => new RoomExtra(c));
    for (const m of Rooms) m.OnTick();
  };

}
