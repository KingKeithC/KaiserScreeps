import { CreepExtra } from "Creep";
import { Miner } from "roles/Miner";
import { CreepRole } from "roles/Role";
import { Scout, ScoutingReport } from "roles/Scout";
import { Defender } from "roles/Defender";
import { Worker } from "roles/Worker";
import { RoomExtra } from "Room";
import profiler from "screeps-profiler";
import { AttackTargetTask, Build, ClaimRoomTask, CollectEnergy, CreepTask, Dismantle, GuardTask, Idle, Mine, Move, Pickup, Repair, Supply, UpdateController } from "tasks";
import { ErrorMapper } from "utils/ErrorMapper";
import { Logger } from "utils/Logger";
import { Attacker } from "roles/Attacker";
import { Dictionary, flatten, propertyOf, sum } from "lodash";
import { Claimer } from "roles/Claimer";
import { RemoteMiner } from "roles/RemoteMiner";
import { FmtRatios } from "utils/Collections";



declare global {
  interface Memory {
    globalEnableProfiling: boolean,
    globalEnableErrorMapper: boolean,
    scoutingReports: Dictionary<ScoutingReport>;
    scoutInterval: number;
    colonyStateReportFrequency: number;
    stats: ColonyStats;
  }
}

declare const global: {
  Colony: Colony;
};


interface ColonyStats {
  time: number;
  [key: string]: number;
}

export class Colony {
  readonly RoleRegistry = new Map<string, CreepRole>();
  readonly TaskRegistry = new Map<string, CreepTask>();
  readonly username: string;

  private _MyCreeps: CreepExtra[] = [];
  get MyCreeps(): CreepExtra[] {
    if (this._MyCreeps.length > 0) return this._MyCreeps;
    this._MyCreeps = Object.values(Game.creeps).filter(c => c.my).map(c => new CreepExtra(c.id, this));
    return this._MyCreeps;
  }

  // All visible room owned by me.
  private _MyRooms: RoomExtra[] = [];
  get MyRooms(): RoomExtra[] {
    if (this._MyRooms.length > 0) return this._MyRooms;
    this._MyRooms = Object.values(Game.rooms).filter(r => r.controller && r.controller.my).map(r => new RoomExtra(r, this));
    return this._MyRooms;
  }

  // All visible rooms, not owned by me.
  private _OtherRooms: Room[] = [];
  get OtherRooms(): Room[] {
    if (this._OtherRooms.length > 0) return this._OtherRooms;
    this._OtherRooms = Object.values(Game.rooms).filter(r => !(r.controller && r.controller.my));
    return this._OtherRooms;
  }

  private _RolesByGroup: Map<string, CreepRole[]> = new Map();
  get RolesByGroup(): Map<string, CreepRole[]> {
    if (this._RolesByGroup.size > 0) return this._RolesByGroup;
    for (const roleType of this.RoleRegistry.values())
      this._RolesByGroup.set(roleType.groupName, [...this._RolesByGroup.get(roleType.groupName) ?? [], roleType]);
    return this._RolesByGroup;
  }

  private _CreepsByAssignedRoom: Map<string, CreepExtra[]> = new Map();
  get CreepsByAssignedRoom(): Map<string, CreepExtra[]> {
    if (this._CreepsByAssignedRoom.size > 0) return this._CreepsByAssignedRoom;
    for (const c of this.MyCreeps)
      this._CreepsByAssignedRoom.set(c.memory.room, [...this._CreepsByAssignedRoom.get(c.memory.room) ?? [], c]);
    return this._CreepsByAssignedRoom;
  }

  GetAllAssignedTasks<Action extends string = string>(taskAction?: Action): CreepTask[] {
    const tasks = this.MyCreeps
      .filter(c => c.memory.jobMemory != null && c.memory.jobMemory != undefined)
      .map(c => c.memory.jobMemory as CreepTask);

    if (!taskAction) return tasks;
    return tasks.filter(t => t.action === taskAction);
  }

  private readonly log = new Logger(this);

  constructor() {
    [
      new Miner(this),
      new RemoteMiner(this),
      new Worker(this),
      new Defender(this),
      new Scout(this),
      new Attacker(this),
      new Claimer(this),
    ].forEach(r => this.RoleRegistry.set(r.name, r));

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
      ["move", Move.prototype],
      ["claim", ClaimRoomTask.prototype],
      ["dismantle", Dismantle.prototype],
    ];
    taskPrototypes.forEach(([kind, task]) => this.TaskRegistry.set(kind, task));

    // Set my username
    this.username = Game.spawns[Object.keys(Game.spawns)[0]].owner.username;
  }

  private WrapWithProfiling(lambda: (() => void)): () => void {
    if (!Memory.globalEnableProfiling) return lambda;

    // Register Profiler only if enabled.
    profiler.registerClass(ErrorMapper, "ErrorMapper");
    profiler.registerClass(CreepExtra, "CreepExtra");
    profiler.registerClass(RoomExtra, "RoomExtra");
    for (const [name, roleType] of this.RoleRegistry.entries())
      profiler.registerClass(roleType.constructor, name);
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
  get ColonyStateReportFrequency(): number { return Memory.colonyStateReportFrequency ?? 1000; }

  OnGlobalReset(): void {
    Memory.creeps ??= {};
    Memory.rooms ??= {};
    Memory.scoutingReports ??= {};
    Memory.scoutInterval ??= CREEP_LIFE_TIME * 2;

    global.Colony = this; // Accessible as `Colony.whatever()` in the console.
    this.stats.lastResetTime = Game.time;
    this.log.crit(`GLOBALS RESET | Profiling Configured: ${this.GlobalEnableProfiling}, ErrorMapper: ${this.GlobalEnableErrorMapper}`);
  }

  // This function is rarely invoked (hundreds of ticks between); when globals reset or code is uploaded.
  // What is returned from this is cached, but is subject to periodic refreshes.
  // Also if too much data is cached, it may cause GC to run more frequently.
  public GetMainLoop(): () => void {
    this.OnGlobalReset();
    return this.WrapWithProfiling(this.WrapWithErrorMapper(this.MainLoop.bind(this)));
  }

  private ClearCaches(): void {
    // Reset Cached fields so they are generated on next access.
    this._MyCreeps = [];
    this._MyRooms = [];
    this._OtherRooms = [];
    this._CreepsByAssignedRoom = new Map();
  }

  // This is the effectively the loop function invoked each tick.
  private MainLoop(): void {
    this.ClearCaches();

    this.CleanupStaleFlags();

    // Try to generate a pixel if we can
    this.TryGeneratingPixel();

    // Run TickStart on each role, so they can do optional bookkeeping.
    for (const role of this.RoleRegistry.values()) role.TickStart();

    // Tick each of my rooms, followed by the creeps assigned to those rooms.
    for (const room of this.MyRooms) {
      room.Tick();
      for (const c of this.CreepsByAssignedRoom.get(room.name) ?? []) {
        c.Tick(room);

        if (!c.spawning) c.PerformRole();
      }
      room.CheckSpawns();
    }

    // Tick all other rooms I can see but don't own
    for (const room of this.OtherRooms)
      this.TickOtherVisibleRoom(room);

    // Run TickEnd on each role, for bookkeeping.
    for (const role of this.RoleRegistry.values()) role.TickEnd();

    // Update the stats for this tick
    this.stats = this.GetCurrentStats();

    // Periodically print a report with the state of the colony.
    if (Game.time % this.ColonyStateReportFrequency === 0)
      this.ColonyStateReport();
  };

  CleanupStaleFlags(): void {
    for (const name in Memory.flags)
      if (!(name in Game.flags)) {
        this.log.info(`Cleanup memory for removed flag: ${name}`);
        delete Memory.flags[name];
      }
  }

  OnRoomSuccessfullyClaimed(newRoom: Room) {
    this.log.crit(`!!!! WE CLAIMED A ROOM ${newRoom} !!!!`);
  }

  TickOtherVisibleRoom(room: Room): void {
    if (room.name in Memory.rooms) {
      // We generally shouldn't be able to get here.
      // This might indicate a previously owned room was lost.
      this.log.warn(`Unowned room ${room.name} appears in owned room memory (Memory.rooms)!`);
      return;
    }

    // Update the scouting reports for unowned rooms
    if (!(room.name in Memory.scoutingReports)) {
      // If the room has never been scouted, create a scouting report for the room
      Memory.scoutingReports[room.name] = (this.RoleRegistry.get("Scout") as Scout).NewScoutingReportRoom(room);
    } else if (Game.time % 50 === 0) {
      // The room has been scouted, regularly fetch a new room report for it, and update the scouting report
      const existing = Memory.scoutingReports[room.name];
      const updates = (this.RoleRegistry.get("Scout") as Scout).NewScoutingReportRoom(room);
      Memory.scoutingReports[room.name] = { ...existing, ...updates };
    }
  }

  TryGeneratingPixel(): void {
    if (Game.cpu.bucket >= 10000) {
      const res = Game.cpu.generatePixel();
      if (res === OK) this.log.info(`!!! Generated a pixel :)`);
    }
  }

  Restart(): void {
    if (Game.cpu.halt == undefined)
      this.log.crit(`Game.cpu.halt() is undefined. Game must in in Isolated VM mode.`);
    else
      Game.cpu.halt();
  }

  GetCurrentStats(): ColonyStats {
    const allMyContainers: StructureContainer[] = flatten(this.MyRooms.map(r => r.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER })));
    return {
      time: Game.time,
      totalEnergyInContainers: sum(allMyContainers.map(c => c.store.getUsedCapacity(RESOURCE_ENERGY))),
      totalEnergyInCreeps: sum(this.MyCreeps.map(c => c.store.getUsedCapacity(RESOURCE_ENERGY))),
      totalEnergyInStorages: sum(this.MyRooms.map(r => r.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0)),
      myCreepsCount: this.MyCreeps.length,
      visibleRooms: Object.keys(Game.rooms).length,
      structures: Object.keys(Game.structures).length,
      lastResetTime: this.stats.lastReset,
    };
  }

  UnassignAllTasks(): void {
    for (const c of this.MyCreeps) {
      this.log.warn(`Clearing Job Memory from ${c.name}... was ${JSON.stringify(c.memory.jobMemory)}`);
      c.memory.jobMemory = {};
    }
  }

  get stats(): ColonyStats { return Memory.stats ?? this.GetCurrentStats(); }
  set stats(value: ColonyStats) { Memory.stats = value; }

  private lastReportStats: ColonyStats = this.GetCurrentStats();
  ColonyStateReport(): void {
    // Calculate differences from lastStats
    var diffs: ColonyStats | undefined = undefined;
    var rates: ColonyStats | undefined = undefined;
    if (this.stats != undefined) {
      diffs = { time: this.stats.time - this.lastReportStats.time };
      rates = { time: 1 };
      for (const k of Object.keys(this.stats)) {
        if (k !== "time") {
          diffs[k] = this.lastReportStats[k] - this.stats[k];
          rates[k] = diffs[k] / diffs.time;
        }
      }
    }

    let msg = `Tick ${Game.time} ::: COLONY REPORT for ${this.username} ::: ${this.MyRooms.length} Owned Rooms, ${this.MyCreeps.length} Creeps\n`;

    // Include memory usage info
    if (Game.cpu.getHeapStatistics != undefined) {
      var mem = Game.cpu.getHeapStatistics();
      msg += `\tMem (Phy / Avail): ${FmtRatios(mem.total_physical_size, mem.total_available_size, true, [], 2, "MiB", 1000000)}, `;
      msg += `Heap (Used / Limit): ${FmtRatios(mem.total_heap_size + mem.externally_allocated_size, mem.heap_size_limit, true, [], 2, "MiB", 1000000)}\n`;
    }

    // Include current stats, and differences from last stats
    msg += `\tStats = ${JSON.stringify(this.stats)}\n`;
    if (diffs != undefined) msg += `\tDiffs = ${JSON.stringify(diffs)}\n`;
    if (rates != undefined) msg += `\tRates = ${JSON.stringify(rates)}\n`;

    for (const myRoom of this.MyRooms)
      msg = msg.concat(`    ${myRoom.RoomStateReport()}\n`);

    // Print
    this.log.report(msg);

    // Update report stats
    this.lastReportStats = this.stats;
  }
}
