import { CreepExtra } from "Creep";
import { Dictionary, sum } from "lodash";
import { Attacker } from "roles/Attacker";
import { Claimer } from "roles/Claimer";
import { Defender } from "roles/Defender";
import { Miner } from "roles/Miner";
import { CreepRole } from "roles/Role";
import { Scout } from "roles/Scout";
import { Worker } from "roles/Worker";
import { RoomExtra } from "Room";
import profiler from "screeps-profiler";
import { AttackTargetTask, Build, ClaimRoomTask, CollectEnergy, CreepTask, Dismantle, GuardTask, Mine, Move, Repair, Supply, UpdateController } from "tasks";
import { FmtRatios } from "utils/Collections";
import { ErrorMapper } from "utils/ErrorMapper";
import { Logger } from "utils/Logger";
import { MakeRoomReport, RoomReport } from "utils/RoomUtils";



declare global {
  interface Memory {
    globalEnableProfiling?: boolean,
    globalEnableErrorMapper?: boolean,
    scoutingReports?: Dictionary<RoomReport>;
    scoutInterval?: number;
    colonyStateReportFrequency?: number;
    stats?: ColonyStats;
  }
}

declare const global: {
  Colony: Colony;
};

type Recursive<T> = T | Dictionary<T | Recursive<T>>;


interface FieldSchema {
  info?: Dictionary<string> // Extra key/value info to associate with the field
  unit?: string, // The type of unit to use for the metric (default: 'number')
  description?: string, // An optional description for the metric.
  labelKeys?: string[], // Each element corresponds to a level in the `Recursive` stat.
}

interface ColonyStats {
  schema: { [key: string]: Recursive<FieldSchema> }
  data: { [key: string]: Recursive<number> }
}

interface RoleRegistry { [name: string]: CreepRole; }
interface TaskRegistry { [name: string]: CreepTask; }

export class Colony {
  readonly Tasks: TaskRegistry = {
    mine: Mine.prototype,
    collectEnergy: CollectEnergy.prototype,
    updateController: UpdateController.prototype,
    build: Build.prototype,
    repair: Repair.prototype,
    supply: Supply.prototype,
    attack: AttackTargetTask.prototype,
    guard: GuardTask.prototype,
    move: Move.prototype,
    claim: ClaimRoomTask.prototype,
    dismantle: Dismantle.prototype,
  } as const;

  readonly Roles: RoleRegistry = {
    Miner: new Miner(this),
    Worker: new Worker(this),
    Defender: new Defender(this),
    Scout: new Scout(this),
    Attacker: new Attacker(this),
    Claimer: new Claimer(this),
  } as const;

  DeserializeTask(value: unknown): CreepTask | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "object")  throw new Error(`Creep Task is not null or object.`);
    if (!("kind" in value)) throw new Error(`Creep Task contains no 'kind' property.`);
    const kind: string = value.kind as string;
    const taskPrototype = this.Tasks[kind];
    if (!taskPrototype) throw new Error(`No Prototype for ${kind} exists.`);
    return Object.assign(Object.create(taskPrototype), value) as CreepTask;
  }

  // Lookup a role from the registry, and throw an error if not found
  GetRole(name: string): CreepRole {
    const role = this.Roles[name];
    if (!role) {
      // It's a game breaking error to have no role
      throw new Error(`Role is not in Registry: ${name}`);
    }
    return role;
  }

  // All the living creeps I own
  private cachedMyCreeps: CreepExtra[] = [];
  get MyCreeps(): CreepExtra[] {
    if (this.cachedMyCreeps.length > 0) return this.cachedMyCreeps;
    this.cachedMyCreeps = Object.values(Game.creeps).filter(c => c.my).map(c => new CreepExtra(c.id, this));
    return this.cachedMyCreeps;
  }

  // All visible room owned by me.
  private cachedMyRooms: RoomExtra[] = [];
  get MyRooms(): RoomExtra[] {
    if (this.cachedMyRooms.length > 0) return this.cachedMyRooms;
    this.cachedMyRooms = Object.values(Game.rooms).filter(r => r.controller && r.controller.my).map(r => new RoomExtra(r, this));
    return this.cachedMyRooms;
  }

  // All visible rooms, not owned by me.
  private cachedOtherRooms: Room[] = [];
  get OtherRooms(): Room[] {
    if (this.cachedOtherRooms.length > 0) return this.cachedOtherRooms;
    this.cachedOtherRooms = Object.values(Game.rooms).filter(r => !(r.controller && r.controller.my));
    return this.cachedOtherRooms;
  }

  // this.MyCreeps Grouped by Assigned Room (creep.memory.room)
  private cachedCreepsByAssignedRoom: Map<string, CreepExtra[]> = new Map();
  get CreepsByAssignedRoom(): Map<string, CreepExtra[]> {
    if (this.cachedCreepsByAssignedRoom.size > 0) return this.cachedCreepsByAssignedRoom;
    for (const c of this.MyCreeps)
      if (c.memory.room)
        this.cachedCreepsByAssignedRoom.set(c.memory.room, [...this.cachedCreepsByAssignedRoom.get(c.memory.room) ?? [], c]);
    return this.cachedCreepsByAssignedRoom;
  }

  // creep.memory.currentTask from all MyCreeps, optionally filtered by a type of action
  private cachedAllAssignedTasks: CreepTask[] = [];
  GetAllAssignedTasks<Action extends string = CreepTask["action"]>(taskAction?: Action): CreepTask[] | CreepTask<Action>[] {
    if (taskAction === undefined && this.cachedAllAssignedTasks.length > 0) return this.cachedAllAssignedTasks;
    if (taskAction !== undefined && this.cachedAllAssignedTasks.length > 0) return this.cachedAllAssignedTasks.filter(t => t.action === taskAction);
    this.cachedAllAssignedTasks = this.MyCreeps.map(c => c.currentTask).filter(t => t !== null) as CreepTask[];
    if (taskAction) return this.cachedAllAssignedTasks.filter(t => t.action === taskAction);
    return this.cachedAllAssignedTasks;
  }

  private readonly log = new Logger(this);

  readonly username: string;
  constructor() {
    // Set my username
    this.username = Game.spawns[Object.keys(Game.spawns)[0]].owner.username;
  }

  private WrapWithProfiling(lambda: (() => void)): () => void {
    if (!Memory.globalEnableProfiling) return lambda;

    // Register Profiler only if enabled.
    profiler.registerClass(ErrorMapper, "ErrorMapper");
    profiler.registerClass(CreepExtra, "CreepExtra");
    profiler.registerClass(RoomExtra, "RoomExtra");
    for (const [name, roleType] of Object.entries(this.Roles))
      profiler.registerClass(roleType.constructor, name);
    for (const [name, taskType] of Object.entries(this.Tasks))
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
    this.stats = { schema: this.stats.schema, data: { ...this.stats.data, lastResetTime: Game.time } };
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
    this.cachedMyCreeps = [];
    this.cachedMyRooms = [];
    this.cachedOtherRooms = [];
    this.cachedAllAssignedTasks = [];
    this.cachedCreepsByAssignedRoom = new Map();
  }

  // Stats are only fetched evey ~90 seconds, so we only need
  StatsFrequency = 30;

  // This is the effectively the loop function invoked each tick.
  private MainLoop(): void {
    this.ClearCaches();
    this.CleanupStaleFlags();
    this.TryGeneratingPixel();

    for (const role of Object.values(this.Roles))
      role.StartOfTick();

    // Tick each of my rooms
    for (const room of this.MyRooms) {
      room.CleanupDeadCreeps();
      room.ValidateClaimedRooms();
      room.ReportHostiles();
      room.RunLinks();
      room.RunTowers();
      room.BuildRoads();
      room.RunCreeps();
      room.CheckSpawns();
      room.DrawVisuals();
    }

    // Tick all other rooms I can see but don't own
    for (const room of this.OtherRooms)
      this.TickOtherVisibleRoom(room);

    // Run TickEnd on each role, for bookkeeping.
    for (const role of Object.values(this.Roles))
      role.EndOfTick();

    // Update stats
    if (Game.time % this.StatsFrequency === 0)
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

    // Update the room reports for unowned rooms
    Memory.scoutingReports ??= {};
    if (!(room.name in Memory.scoutingReports)) {
      // If the room has never been scouted, create a scouting report for the room
      Memory.scoutingReports[room.name] = MakeRoomReport(room);
    } else if (Game.time % 50 === 0) {
      // The room has been scouted, regularly fetch a new room report for it, and update the existing scouting report
      const existing = Memory.scoutingReports[room.name];
      const updates = MakeRoomReport(room);
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
    if (Game.cpu.halt === undefined)
      this.log.crit(`Game.cpu.halt() is undefined. Game must in in Isolated VM mode.`);
    else
      Game.cpu.halt();
  }

  MapNameable<N extends { name: string }, T>(iterOfNamed: Iterable<N>, mapper: (n: N) => T): Dictionary<T> {
    const ret: Dictionary<T> = {};
    for (const named of iterOfNamed) ret[named.name] = mapper(named);
    return ret;
  }

  DisplayCurrentStats(): void {
    this.log.report(JSON.stringify(this.GetCurrentStats(), undefined, 2))
  }

  GetCurrentStats(): ColonyStats {
    /* eslint-disable camelcase */
    const resources: Dictionary<number> = {};
    for (const r of Object.entries(Game.resources))
      resources[r[0]] = r[1] as number;

    const roomStats: { [key: string]: Dictionary<number>; } = {};
    roomStats.my_creep_count = this.MapNameable(Object.values(Game.rooms), vr => vr.find(FIND_MY_CREEPS).length);
    roomStats.neutral_structure_count = this.MapNameable(Object.values(Game.rooms), vr => vr.find(FIND_STRUCTURES, {filter: s => !("owner" in s)}).length);
    roomStats.hostile_creep_count = this.MapNameable(Object.values(Game.rooms), vr => vr.find(FIND_HOSTILE_CREEPS).length);
    roomStats.my_structure_count = this.MapNameable(Object.values(Game.rooms), vr => vr.find(FIND_MY_STRUCTURES).length);
    roomStats.hostile_structure_count = this.MapNameable(Object.values(Game.rooms), vr => vr.find(FIND_HOSTILE_STRUCTURES).length);
    roomStats.dropped_energy_amount = this.MapNameable(Object.values(Game.rooms), vr => sum(vr.find(FIND_DROPPED_RESOURCES), r => r.resourceType === RESOURCE_ENERGY ? r.amount : 0));
    roomStats.my_constructions_count = this.MapNameable(Object.values(Game.rooms), vr => vr.find(FIND_MY_CONSTRUCTION_SITES).length);
    roomStats.capacity_of_storage = this.MapNameable(Object.values(Game.rooms), vr => vr.storage?.store.getCapacity() ?? 0);
    roomStats.energy_in_storage  = this.MapNameable(Object.values(Game.rooms), vr => vr.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0);
    roomStats.energy_in_spawns  = this.MapNameable(Object.values(Game.rooms), vr => vr.energyAvailable);
    roomStats.energy_in_sources  = this.MapNameable(Object.values(Game.rooms), vr => sum(vr.find(FIND_SOURCES).map(s => s.energy)));
    roomStats.capacity_of_spawns  = this.MapNameable(Object.values(Game.rooms), vr => vr.energyCapacityAvailable);
    roomStats.energy_in_containers = this.MapNameable(Object.values(Game.rooms), vr => sum(vr.find(FIND_STRUCTURES).map(s => s.structureType === STRUCTURE_CONTAINER ? s.store.getUsedCapacity(RESOURCE_ENERGY) : 0)));
    roomStats.energy_in_my_creeps = this.MapNameable(Object.values(Game.rooms), vr => sum(vr.find(FIND_MY_CREEPS).map(s => s.store.getUsedCapacity(RESOURCE_ENERGY))));
    roomStats.energy_in_links = this.MapNameable(Object.values(Game.rooms), vr => sum(vr.find(FIND_STRUCTURES).map(s => s.structureType === STRUCTURE_LINK ? s.store.getUsedCapacity(RESOURCE_ENERGY) : 0)));

    const roleStats: { [key: string]: Dictionary<number> | Dictionary<Dictionary<number>>; } = {};
    roleStats.global_quota = this.MapNameable(Object.values(this.Roles), ro => ro.GetGlobalQuota())
    roleStats.room_quota = this.MapNameable(Object.values(this.Roles), r => this.MapNameable(this.MyRooms, ro => r.GetRoomQuota(ro)))
    roleStats.assigned_room_count = this.MapNameable(Object.values(this.Roles), r => this.MapNameable(this.MyRooms, ro => r.GetRoomCreepsInRole(ro).length))

    const meminfo: Dictionary<number> = {};
    if (Game.cpu.getHeapStatistics) {
      for (const [k, v] of Object.entries(Game.cpu.getHeapStatistics()))
        meminfo[k] = v as number;

      // Not sure what this even means, / I don't care
      // and it breaks the rest of the schema for this field
      if ("does_zap_garbage" in meminfo) delete meminfo.does_zap_garbage;
    }

    return {
      schema: {
        time: { unit: "ticks", description: "Monotonicly increasing tick counter, the current 'time' of the Game.", },
        last_reset_time: { unit: "ticks", description: "Last time the Program was Reset (happens on code push, or semi-rarely by the platform)" },
        visible_rooms_count: { unit: "number", description: "The total number of visible rooms this tick." },
        gcl: {
          level: { unit: "number", description: "The current Global Control Level. Increased by upgrading controllers." },
          progress: { unit: "number", description: "Progress toward the next Global Control Level." },
          progressTotal: { unit: "number", description: "The Global Control Level will increase when Progress reaches this amount." },
        },
        gpl: {
          level: { unit: "number", description: "The current Global Power Level. Increased by harvesting Power from Highway rooms." },
          progress: { unit: "number", description: "Progress toward the next Global Power Level." },
          progressTotal: { unit: "number", description: "The Global Power Level will increase when Progress reaches this amount." },
        },
        cpu: {
          unusedBucket: { unit: "cpu", description: "How much CPU has accumulated in the bucket (limit 10k)." },
          used: { unit: "cpu", description: "How much CPU was used this tick in the execution of scripts." },
          limit: { unit: "cpu", description: "The maximum average limit of CPU usage. Excess unused amount below the limit contributes to the unusedBucket." },
          tickLimit: { unit: "cpu", description: "How much CPU total are we allowed to burst to (and consume from the bucket) this tick?" },
        },
        resources: {
          labelKeys: ["resourceType"],
          unit: "number",
          description: "Account level resources.",
        },
        meminfo: {
          unit: "bytes(SI)",
          description: "How much memory are scripts using.",
        },
        ...{
          global_quota: {
            labelKeys: ["role"],
            unit: "number",
            description: "The maximum limit of creeps that may be spawned in all owned rooms.",
        },
          room_quota: {
            labelKeys: ["role", "room"],
            unit: "number",
            description: "The maximum limit of creeps that may be spawned in this role or room.",
        },
          assigned_room_count: {
            labelKeys: ["role", "room"],
            unit: "number",
            description: "The living number of creeps currently spawned by assigned room.",
          },
        },
        ...{
          my_creep_count: {
            labelKeys: ["room"],
            unit: "number",
            description: "The living number of creeps currently spawned by occupied room.",
          },
          neutral_structure_count: {
            labelKeys: ["room"],
            unit: "number",
            description: "Structures that have no owner.",
          },
          hostile_creep_count: {
            labelKeys: ["room"],
            unit: "number",
            description: "Living hostile creep count.",
          },
          my_structure_count: {
            labelKeys: ["room"],
            unit: "number",
            description: "Structures I own.",
          },
          hostile_structure_count: {
            labelKeys: ["room"],
            unit: "number",
            description: "Non-Neutral structures owned by someone else.",
          },
          dropped_energy_amount: {
            labelKeys: ["room"],
            unit: "number",
            description: "Total amount of energy sitting on the ground.",
          },
          my_constructions_count: {
            labelKeys: ["room"],
            unit: "number",
            description: "Count of ongoing Constructions sites.",
          },
          capacity_of_storage: {
            labelKeys: ["room"],
            unit: "number",
            description: "How much space is available in room storage.",
          },
          energy_in_storage: {
            labelKeys: ["room"],
            unit: "number",
            description: "How storage space is used by energy.",
          },
          energy_in_spawns: {
            labelKeys: ["room"],
            unit: "number",
            description: "Total energy of all spawns and extensions.",
          },
          energy_in_sources: {
            labelKeys: ["room"],
            unit: "number",
            description: "Total amount of all energy sources in the room.",
          },
          capacity_of_spawns: {
            labelKeys: ["room"],
            unit: "number",
            description: "Total capacity of all spawns and extensions.",
          },
          energy_in_containers: {
            labelKeys: ["room"],
            unit: "number",
            description: "Total amount of energy in all containers in the room.",
          },
          energy_in_my_creeps: {
            labelKeys: ["room"],
            unit: "number",
            description: "Total amount of energy my creeps are carrying in the room.",
          },
          energy_in_links: {
            labelKeys: ["room"],
            unit: "number",
            description: "Total amount of energy sitting in links in the room.",
          },
        },
      },
      data: {
        time: Game.time,
        last_reset_time: this.stats.data.lastResetTime ?? 0,
        visible_rooms_count: Object.keys(Game.rooms).length,
        gcl: {
          level: Game.gcl.level,
          progress: Game.gcl.progress,
          progressTotal: Game.gcl.progressTotal,
        },
        gpl: {
          level: Game.gpl.level,
          progress: Game.gpl.progress,
          progressTotal: Game.gpl.progressTotal,
        },
        cpu: {
          unusedBucket: Game.cpu.bucket,
          used: Game.cpu.getUsed(),
          limit: Game.cpu.limit,
          tickLimit: Game.cpu.tickLimit,
        },
        resources,
        meminfo,
        ...roleStats,
        ...roomStats,
      },
    };
    /* eslint-enable camelcase */
  }

  UnassignAllTasks(): void {
    for (const c of this.MyCreeps) {
      this.log.warn(`Clearing Job Memory from ${c.name}... was ${JSON.stringify(c.memory.currentTask)}`);
      c.memory.currentTask = undefined;
    }
  }

  get stats(): ColonyStats { return Memory.stats ?? this.GetCurrentStats(); }
  set stats(value: ColonyStats) { Memory.stats = value; }

  ColonyStateReport(): void {
    let msg = `Tick ${Game.time} ::: COLONY REPORT for ${this.username} ::: ${this.MyRooms.length} Owned Rooms, ${this.MyCreeps.length} Creeps\n`;

    // Include memory usage info
    if (Game.cpu.getHeapStatistics !== undefined) {
      const mem = Game.cpu.getHeapStatistics();
      msg += `\tMem (Phy / Avail): ${FmtRatios(mem.total_physical_size, mem.total_available_size, true, [], 2, "MiB", 1000000)}, `;
      msg += `Heap (Used / Limit): ${FmtRatios(mem.total_heap_size + mem.externally_allocated_size, mem.heap_size_limit, true, [], 2, "MiB", 1000000)}\n`;
    }

    for (const myRoom of this.MyRooms)
      msg = msg.concat(`    ${myRoom.RoomStateReport()}\n`);

    // Print
    this.log.report(msg);
  }
}
