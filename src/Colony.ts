import { CreepExtra } from 'Creep';
import { Dictionary, flatten, unique } from 'lodash';
import { Attacker } from 'roles/Attacker';
import { Claimer } from 'roles/Claimer';
import { Defender } from 'roles/Defender';
import { Maintainer } from 'roles/Maintainer';
import { Miner } from 'roles/Miner';
import { CreepRole, CreepRoleBase } from 'roles/Role';
import { Scout } from 'roles/Scout';
import { Worker } from 'roles/Worker';
import { RoomExtra } from 'Room';
import profiler from 'screeps-profiler';
import { GetColonyStats, ColonyStats } from 'Stats';
import { TaskPrototypes } from 'tasks';
import { TradingSystem } from 'Trading';
import { FmtRatios } from 'utils/Collections';
import { ErrorMapper } from 'utils/ErrorMapper';
import { Logger } from 'utils/Logger';
import { MakeRoomReport, RoomReport } from 'utils/RoomUtils';

declare global {
  interface Memory {
    profiler: object;
    rooms: Record<Room['name'], RoomMemory>;
    flags: Record<Flag['name'], FlagMemory>;
    creeps: Record<Creep['name'], CreepMemory>;
    terminals: Record<Id<StructureTerminal>, TerminalMemory>;
    globalEnableProfiling?: boolean;
    globalEnableErrorMapper?: boolean;
    globalEnablePathVisuals?: boolean;
    scoutingReports?: Dictionary<RoomReport>;
    scoutInterval?: number;
    colonyStateReportFrequency?: number;
    stats?: ColonyStats;
    logLevelName?: string;
    logFormat?: string;
  }
}

declare const global: { Colony: Colony };

export class Colony {
  readonly Roles: { [name in CreepRole['name']]: CreepRoleBase } = {
    Maintainer: new Maintainer(this),
    Miner: new Miner(this),
    Worker: new Worker(this),
    Defender: new Defender(this),
    Scout: new Scout(this),
    Attacker: new Attacker(this),
    Claimer: new Claimer(this),
  } as const;

  // Lookup a role from the registry, and throw an error if not found
  GetRole(roleName: string): CreepRole {
    const role = this.Roles[roleName];
    if (!role) {
      // It's a game breaking error to have no role
      this.log.crit('Role is not in registry.', { roleName });
    }
    return role;
  }

  readonly Creeps: Map<string, CreepExtra> = new Map();
  readonly Rooms: Map<string, RoomExtra> = new Map();

  private readonly log = new Logger(this);
  readonly username = Game.spawns[Object.keys(Game.spawns)[0]].owner.username;

  private trading = new TradingSystem(this);

  private WrapWithProfiling(lambda: () => void): () => void {
    if (!Memory.globalEnableProfiling) return lambda;

    // Register Profiler only if enabled.
    profiler.registerClass(ErrorMapper, 'ErrorMapper');
    profiler.registerClass(CreepExtra, 'CreepExtra');
    profiler.registerClass(RoomExtra, 'RoomExtra');
    for (const [name, roleType] of Object.entries(this.Roles)) profiler.registerClass(roleType.constructor, name);
    for (const [action, taskType] of TaskPrototypes) profiler.registerClass(taskType, action);
    profiler.registerClass(Colony, 'Colony');
    profiler.enable();
    return () => profiler.wrap(lambda);
  }

  private WrapWithErrorMapper(lambda: () => void): () => void {
    if (!Memory.globalEnableErrorMapper) return lambda;
    return ErrorMapper.wrapLoop(lambda);
  }

  get LogFormat() {
    return Memory.logFormat ?? Logger.DefaultLogFormat;
  }
  set LogFormat(value) {
    Memory.logFormat = value;
  }
  get LogLevelName() {
    return Memory.logLevelName ?? Logger.DefaultLogLevelName;
  }
  set LogLevelName(value) {
    Memory.logLevelName = value;
  }
  get GlobalEnableProfiling() {
    return Memory.globalEnableProfiling ?? true;
  }
  set GlobalEnableProfiling(value) {
    Memory.globalEnableProfiling = value;
  }
  get GlobalEnableErrorMapper() {
    return Memory.globalEnableErrorMapper ?? true;
  }
  set GlobalEnableErrorMapper(value) {
    Memory.globalEnableErrorMapper = value;
  }
  get ColonyStateReportFrequency(): number {
    return Memory.colonyStateReportFrequency ?? 1000;
  }

  OnGlobalReset(): void {
    // Makes this object accessible as `Colony.whatever()` in the console.
    global.Colony = this;

    // Initialize global memory
    Memory.creeps ??= {};
    Memory.rooms ??= {};
    Memory.flags ??= {};
    Memory.terminals ??= {};
    Memory.scoutingReports ??= {};
    Memory.scoutInterval ??= CREEP_LIFE_TIME * 2;

    this.RefreshCaches();

    // Rebuild stats to migrate persisted data to the current schema, then record this reset.
    const stats = GetColonyStats(this);
    // eslint-disable-next-line camelcase
    stats.data.program_reset_time_ticks = Game.time;
    this.stats = stats;

    this.log.crit('Global state reset.', {
      profilingEnabled: this.GlobalEnableProfiling,
      errorMapperEnabled: this.GlobalEnableErrorMapper,
    });
  }

  // This function is rarely invoked (hundreds of ticks between); when globals reset or code is uploaded.
  // What is returned from this is cached, but is subject to periodic refreshes.
  // Also if too much data is cached, it may cause GC to run more frequently.
  public GetMainLoop(): () => void {
    this.OnGlobalReset();
    return this.WrapWithProfiling(this.WrapWithErrorMapper(this.MainLoop.bind(this)));
  }

  private cachedMyCreeps: CreepExtra[] = [];
  get MyCreeps(): CreepExtra[] {
    if (this.cachedMyCreeps.length > 0) return this.cachedMyCreeps;
    for (const creep of this.Creeps.values()) if (creep.my) this.cachedMyCreeps.push(creep);
    return this.cachedMyCreeps;
  }

  private cachedMyRooms: RoomExtra[] = [];
  get MyRooms(): RoomExtra[] {
    if (this.cachedMyRooms.length > 0) return this.cachedMyRooms;
    for (const room of this.Rooms.values()) if (room.controller && room.controller.my) this.cachedMyRooms.push(room);
    return this.cachedMyRooms;
  }

  private cachedOtherRooms: RoomExtra[] = [];
  get OtherRooms(): RoomExtra[] {
    if (this.cachedOtherRooms.length > 0) return this.cachedOtherRooms;
    for (const room of this.Rooms.values())
      if (!(room.controller && room.controller.my)) this.cachedOtherRooms.push(room);
    return this.cachedOtherRooms;
  }

  private RefreshCaches(): void {
    this.Rooms.clear();
    this.Creeps.clear();
    this.cachedMyRooms = [];
    this.cachedOtherRooms = [];
    this.cachedMyCreeps = [];
    for (const [name, creep] of Object.entries(Game.creeps))
      if (creep.my) this.Creeps.set(name, new CreepExtra(creep.id, this));

    for (const [name, room] of Object.entries(Game.rooms))
      if (room.controller === undefined || room.controller.owner === undefined || room.controller.my)
        this.Rooms.set(name, new RoomExtra(room, this));
  }

  // Stats are only fetched evey ~90 seconds, so we only need to update them infrequently
  StatsFrequency = 8;

  // This is the effectively the loop function invoked each tick.
  private MainLoop(): void {
    this.RefreshCaches(); // Must be called before any Creep/Room access on the colony

    this.CleanupStaleFlags();
    this.TryGeneratingPixel();
    this.trading.OncePerTick();

    for (const role of Object.values(this.Roles)) role.StartOfTick();
    for (const creep of this.MyCreeps) creep.StartOfTick();

    // Perform Actions
    for (const room of this.MyRooms) {
      room.AcumulateEvents();
      room.CleanupDeadCreeps(); // Should be done before RunCreeps
      room.ReportHostiles();
      room.RunLinks();
      room.RunTowers();
      room.BuildRoads();
      room.RunCreeps();
      room.CheckSpawns();
      room.DrawVisuals();
      this.trading.OncePerRoom(room);
    }

    // Tick all other rooms I can see but don't own
    for (const room of this.OtherRooms) this.TickOtherVisibleRoom(room);

    // Call end of tick for bookkeeping
    for (const creep of this.MyCreeps) creep.EndOfTick();
    for (const role of Object.values(this.Roles)) role.EndOfTick();

    // Delete stale cost matrices
    this.MyRooms.filter(r => r.CostMatrixIsStale).forEach(r => r.ClearStructureDependentData());

    // Periodically print a report with the state of the colony.
    if (Game.time % this.ColonyStateReportFrequency === 0) this.ColonyStateReport();

    // Update colony stats
    if (Game.time % this.StatsFrequency === 0) this.stats = GetColonyStats(this);
  }

  CleanupStaleFlags(): void {
    for (const name in Memory.flags)
      if (!(name in Game.flags)) {
        this.log.info('Cleaning up memory for a removed flag.', { flagName: name });
        delete Memory.flags[name];
      }
  }

  OnRoomSuccessfullyClaimed(newRoom: Room) {
    this.log.crit('Successfully claimed a room.', { '<room>': newRoom });
  }

  RegenerateCostMatrixes(): void {
    this.MyRooms.forEach(r => {
      r.ClearStructureDependentData();
      this.log.report('Regenerated pathfinding cost matrix.', {
        '<room>': r,
        generated: r.StructuresCostMatrix !== null,
      });
    });
  }

  get AllClaimedRoomNames(): string[] {
    return unique(flatten(this.MyRooms.map(mr => mr.ClaimedRoomNames)));
  }

  TickOtherVisibleRoom(room: Room): void {
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

  StakeClaimOnRoom(claimer: CreepExtra, newRoom: string): void {
    if (newRoom in claimer.AssignedRoom.ClaimedRoomNames) return;

    if (newRoom in this.AllClaimedRoomNames) {
      this.log.info('Room is already claimed elsewhere.', { '<creep>': claimer, targetRoom: newRoom });
      return;
    }

    const room = Game.rooms[newRoom];
    if (!newRoom) throw new Error(`${claimer} Tried claiming room ${newRoom} we cannot see!`);

    if (room.controller?.owner?.username !== this.username) return;

    claimer.AssignedRoom.ClaimedRoomNames.push(newRoom);
  }

  PixelCost = 9000;
  TryGeneratingPixel(): void {
    if (Game.cpu.bucket >= this.PixelCost) {
      const res = Game.cpu.generatePixel();
      if (res === OK) this.log.info('Generated a pixel.');
    }
  }

  Restart(): void {
    this.UnassignAllTasks();

    if (Game.cpu.halt === undefined) this.log.crit('Game.cpu.halt() is undefined; isolated VM mode is required.');
    else Game.cpu.halt();
  }

  MapNameable<N extends { name: string }, T>(iterOfNamed: Iterable<N>, mapper: (n: N) => T): Record<string, T> {
    const ret: Record<string, T> = {};
    for (const named of iterOfNamed) ret[named.name] = mapper(named);
    return ret;
  }

  DisplayCurrentStats(): void {
    this.stats = GetColonyStats(this); // Force a stat refresh
    this.log.report('Current colony stats.', { stats: this.stats });
  }

  UnassignAllTasks(): void {
    for (const c of this.MyCreeps) {
      this.log.warn('Clearing creep task memory.', { '<creep>': c, currentTask: c.memory.currentTask });
      c.memory.currentTask = undefined;
    }
  }

  get stats(): ColonyStats {
    return (Memory.stats ??= GetColonyStats(this));
  }

  set stats(value: ColonyStats) {
    Memory.stats = value;
  }

  ColonyStateReport(): void {
    let msg = `Tick ${Game.time} ::: COLONY REPORT for ${this.username} ::: ${this.MyRooms.length} Owned Rooms, ${this.MyCreeps.length} Creeps\n`;

    // Include memory usage info
    if (Game.cpu.getHeapStatistics !== undefined) {
      const mem = Game.cpu.getHeapStatistics();
      msg += `\tMem (Phy / Avail): ${FmtRatios(mem.total_physical_size, mem.total_available_size, true, [], 2, 'MiB', 1000000)}, `;
      msg += `Heap (Used / Limit): ${FmtRatios(mem.total_heap_size + mem.externally_allocated_size, mem.heap_size_limit, true, [], 2, 'MiB', 1000000)}\n`;
    }

    for (const myRoom of this.MyRooms) msg = msg.concat(`    ${myRoom.RoomStateReport()}\n`);

    // Print
    this.log.report('Colony state report.', { report: msg });
  }
}
