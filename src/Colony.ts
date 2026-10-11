import { CreepExtra } from "Creep";
import { Miner, MinerII } from "roles/Miner";
import { CreepRole } from "roles/Role";
import { Scout } from "roles/Scout";
import { Settler } from "roles/Settler";
import { Warrior } from "roles/Warrior";
import { WorkerI, WorkerII, WorkerIII } from "roles/Worker";
import { RoomExtra } from "Room";
import profiler from "screeps-profiler";
import { AttackTargetTask, Build, ClaimRoomTask, CollectEnergy, CreepTask, GuardTask, Idle, Mine, Pickup, Repair, ScoutMissionTask, Supply, UpdateController } from "Tasks";
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
  readonly RoleRegistry = new Map<string, CreepRole>();
  readonly TaskRegistry = new Map<string, CreepTask>();


  private _MyCreeps: CreepExtra[] = [];
  get MyCreeps(): CreepExtra[] {
    if (this._MyCreeps.length > 0) return this._MyCreeps;
    this._MyCreeps = Object.values(Game.creeps).filter(c => c.my).map(c => new CreepExtra(c.id, this));
    return this._MyCreeps;
  }

  private _MyRooms: RoomExtra[] = [];
  get MyRooms(): RoomExtra[] {
    if (this._MyRooms.length > 0) return this._MyRooms;
    this._MyRooms = Object.values(Game.rooms).filter(r => r.controller && r.controller.my).map(r => new RoomExtra(r, this));
    return this._MyRooms;
  }

  get RolesByGroup(): Map<string, CreepRole[]> {
    const groups = new Map<string, CreepRole[]>();
    for (const roleType of this.RoleRegistry.values())
      groups.set(roleType.groupName, [...groups.get(roleType.groupName) ?? [], roleType]);
    return groups;
  }

  private _CreepsByRoom: Map<string, CreepExtra[]> = new Map();
  get CreepsByRoom(): Map<string, CreepExtra[]> {
    if (this._CreepsByRoom.size > 0) return this._CreepsByRoom;
    for (const c of this.MyCreeps)
      this._CreepsByRoom.set(c.memory.room, [...this._CreepsByRoom.get(c.memory.room) ?? [], c]);
    return this._CreepsByRoom;
  }

  private readonly log = new Logger(this);

  constructor() {
    var offset: number = 0;
    [
      new WorkerI(this),
      new WorkerII(this),
      new WorkerIII(this),
      new Miner(this),
      new MinerII(this),
      new Settler(this),
      new Scout(this),
      new Warrior(this),
    ].forEach(r => {
      r.SpawnTickOffet = offset;
      this.RoleRegistry.set(r.name, r);
      offset += 3;
    });

    const taskPrototypes: [string, CreepTask][] = [
      ["idle", Idle.prototype],
      ["mine", Mine.prototype],
      ["collectEnergy", CollectEnergy.prototype],
      ["updateController", UpdateController.prototype],
      ["build", Build.prototype],
      ["repair", Repair.prototype],
      ["supply", Supply.prototype],
      ["pickup", Pickup.prototype],
      ["attack", AttackTargetTask.prototype],
      ["guard", GuardTask.prototype],
      ["scout", ScoutMissionTask.prototype],
      ["claim", ClaimRoomTask.prototype],
    ];
    taskPrototypes.forEach(([kind, task]) => this.TaskRegistry.set(kind, task));
  }

  private WrapWithProfiling(lambda: (() => void)): () => void {
    if (!Memory.globalEnableProfiling) return lambda;

    // Register Profiler only if enabled.
    profiler.registerClass(ErrorMapper, "ErrorMapper");
    profiler.registerClass(CreepExtra, "CreepExtra");
    profiler.registerClass(RoomExtra, "RoomExtra");
    for (const [name, roleType] of this.RoleRegistry.entries())
      profiler.registerClass(roleType, name);
    for (const [name, taskType] of this.TaskRegistry.entries())
      profiler.registerClass(taskType, name);
    profiler.registerClass(Colony, "Colony");
    profiler.enable();
    return () => profiler.wrap(lambda);
  }

  private WrapWithErrorMapper(lambda: (() => void)): () => void {
    if (!Memory.globalEnableErrorMapper) return lambda;
    return ErrorMapper.wrapLoop(lambda);
  }

  get LogFormat() { return Memory.logFormat ?? Logger.DefaultLogFormat; }
  set LogFormat(value) { Memory.logFormat = value; }
  get LogLevelName() { return Memory.logLevelName ?? Logger.DefaultLogLevelName; }
  set LogLevelName(value) { Memory.logLevelName = value; }
  get GlobalEnableProfiling() { return Memory.globalEnableProfiling ?? true; }
  set GlobalEnableProfiling(value) { Memory.globalEnableProfiling = value; }
  get GlobalEnableErrorMapper() { return Memory.globalEnableErrorMapper ?? true; }
  set GlobalEnableErrorMapper(value) { Memory.globalEnableErrorMapper = value; }

  // This function is rarely invoked (hundreds of ticks between); when globals reset or code is uploaded.
  // What is returned from this is cached, but is subject to periodic refreshes.
  // Also if too much data is cached, it may cause GC to run more frequently.
  public GetMainLoop(): () => void {
    this.log.crit(`GLOBALS RESET | Profiling Configured: ${this.GlobalEnableProfiling}, ErrorMapper: ${this.GlobalEnableErrorMapper}`);
    global.Colony = this; // Accessible as `Colony.whatever()` in the console.
    this.CleanupMissingCreeps();
    return this.WrapWithProfiling(this.WrapWithErrorMapper(this.MainLoop.bind(this)));
  }

  private ClearCaches(): void {
    // Reset Cached fields so they are generated on next access.
    this._MyCreeps = [];
    this._MyRooms = [];
    this._CreepsByRoom = new Map();
  }

  // This is the effective loop function invoked each tick.
  private MainLoop(): void {
    this.ClearCaches();

    // Try to generate a pixel if we can
    this.TryGeneratingPixel();

    // Run TickStart on each role, so they can do optional bookkeeping.
    for (const role of this.RoleRegistry.values()) role.TickStart();

    // Tick each room, and then each creep in the room
    for (const room of this.MyRooms) {
      room.Tick();
      for (const c of this.CreepsByRoom.get(room.name) ?? []) c.TickFriendlyCreep(room);
    }

    // Run TickEnd on each role, for bookkeeping.
    for (const role of this.RoleRegistry.values()) role.TickEnd();
  };

  TryGeneratingPixel(): void {
    if (Game.cpu.bucket >= 10000) {
      const res = Game.cpu.generatePixel();
      if (res === OK) this.log.info(`!!! Generated a pixel :)`);
    }
  }

  CleanupMissingCreeps(): void {
    for (const name in Memory.creeps) {
      if (!(name in Game.creeps)) {
        this.log.info(`Cleanup memory for ${name}`);
        delete Memory.creeps[name];
      }
    }
  }

  SaySomething(): void { this.log.crit("Something"); }
}
