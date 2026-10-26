import { Dictionary, filter, flatten, range, unique } from 'lodash';
import { CreepTask, Mine, Repair, TaskAction, UpdateController } from 'tasks';
import {
  FormatHostileInfos,
  GetHostileInfo,
  GetMiningPositions,
  HostileInfo,
  MakeRoomReport,
  MiningPosition,
} from 'utils/RoomUtils';
import { Colony } from 'Colony';
import { CreepExtra } from 'Creep';
import { DeserializeRoomPosition, FmtRatios, LerpColour, SerializeRoomPosition } from 'utils/Collections';
import { Colours } from 'Data';
import { CreepRole } from 'roles/Role';
import { Logger } from 'utils/Logger';
import { BodyCost } from 'utils/CreepUtils';

declare global {
  interface RoomMemory {
    lastSpawnTick?: { [roleName: string]: number };
    roleLimits?: { [roleName: string]: number };
    enableVisuals?: boolean;
    enableRepairOverlay?: boolean;
    attackHostiles?: boolean;
    disableWarriors?: boolean;
    disableTowers?: boolean;
    disableTowerAttacks?: boolean;
    towerAttackRange?: number;
    towerAttackRangeTiles?: number;
    eventCounts?: Dictionary<number>;
    eventAmounts?: Dictionary<number>;
    towerCriticalSupplyRatio?: number;
    hostileNotificationThreshold?: number;
    claimedNearby?: string[];
    mines?: MiningPosition[];
    storageWartimeEnergyBuffer?: number;
    linkGroups?: Dictionary<Id<StructureLink>[]>;
    enableCostMatrixOverlay?: boolean;
    pathfindingCostMatrixDate?: number;
    pathfindingCostMatrix?: number[];
    storeOverUpgrade?: boolean;
  }
}

export class RoomExtra extends Room {
  readonly colony: Colony;
  readonly log: Logger<RoomExtra> = new Logger(this, { formatArgs: { '<room>': this } });
  readonly AssignedCreeps: CreepExtra[];
  readonly AssignedCreepsByRoleName: Map<string, CreepExtra[]>;
  readonly AssignedCreepsByRoleGroup: Map<string, CreepExtra[]>;

  parent?: RoomExtra;

  constructor(room: Room, colony: Colony, parent?: RoomExtra) {
    // Superclass Init
    super(room.name);
    this.controller = room.controller;
    this.storage = room.storage;
    this.terminal = room.terminal;
    this.energyAvailable = room.energyAvailable;
    this.energyCapacityAvailable = room.energyCapacityAvailable;

    // This class init
    this.parent = parent;
    this.colony = colony;
    this.AssignedCreeps = colony.CreepsByAssignedRoom.get(this.name) ?? [];

    this.AssignedCreepsByRoleName = new Map();
    this.AssignedCreepsByRoleGroup = new Map();
    for (const c of this.AssignedCreeps) {
      if (!c.role) continue;
      this.AssignedCreepsByRoleName.set(c.role.name, [...(this.AssignedCreepsByRoleName.get(c.role.name) ?? []), c]);
      this.AssignedCreepsByRoleGroup.set(c.role.groupName, [
        ...(this.AssignedCreepsByRoleGroup.get(c.role.groupName) ?? []),
        c,
      ]);
    }
  }

  GetAssignedTasks(taskAction?: string): CreepTask[] {
    const ret = [];

    for (const c of this.AssignedCreeps) if (c.currentTask) ret.push(c.currentTask);

    if (!taskAction) return ret;
    return ret.filter(t => t.action === taskAction);
  }

  get StoreOverUpgrade() {
    return this.memory.storeOverUpgrade ?? true;
  }

  get EnableVisuals(): boolean {
    return this.memory.enableVisuals ?? true;
  }
  set EnableVisuals(value: boolean) {
    this.memory.enableVisuals = value;
  }
  get EnableRepairOverlay(): boolean {
    return this.memory.enableRepairOverlay ?? false;
  }
  set EnableRepairOverlay(value: boolean) {
    this.memory.enableRepairOverlay = value;
  }
  get AttackHostiles(): boolean {
    return this.memory.attackHostiles ?? true;
  }
  set AttackHostiles(value: boolean) {
    this.memory.attackHostiles = value;
  }
  get DisableWarriors(): boolean {
    return this.memory.disableWarriors ?? false;
  }
  set DisableWarriors(value: boolean) {
    this.memory.disableWarriors = value;
  }
  get DisableTowers(): boolean {
    return this.memory.disableTowers ?? false;
  }
  set DisableTowers(value: boolean) {
    this.memory.disableTowers = value;
  }
  get DisableTowerAttacks(): boolean {
    return this.memory.disableTowerAttacks ?? false;
  }
  set DisableTowerAttacks(value: boolean) {
    this.memory.disableTowerAttacks = value;
  }
  get TowerAttackRange(): number {
    return this.memory.towerAttackRange ?? 20;
  }
  set TowerAttackRange(value: number) {
    this.memory.towerAttackRange = value;
  }
  get TowerCriticalSupplyRatio(): number {
    return this.memory.towerCriticalSupplyRatio ?? 0.75;
  }
  set TowerCriticalSupplyRatio(value: number) {
    this.memory.towerCriticalSupplyRatio = value;
  }
  get HostileNotificationThreshold(): number {
    return this.memory.hostileNotificationThreshold ?? 2;
  }
  set HostileNotificationThreshold(value: number) {
    this.memory.hostileNotificationThreshold = value;
  }
  get StorageWartimeEnergyBuffer(): number {
    return this.memory.storageWartimeEnergyBuffer ?? 5000;
  }
  get LinkGroups(): { [key: string]: Id<StructureLink>[] } {
    return this.memory.linkGroups ?? {};
  }
  set LinkGroups(value: { [key: string]: Id<StructureLink>[] }) {
    this.memory.linkGroups = value;
  }

  set Mines(value: MiningPosition[]) {
    this.memory.mines = value;
  }
  get Mines(): MiningPosition[] {
    if (this.memory.mines === undefined || this.memory.mines.length === 0) this.memory.mines = GetMiningPositions(this); // Update memoized
    return this.memory.mines; // Return memoized
  }

  set ClaimedRoomNames(value: string[]) {
    this.memory.claimedNearby = unique(value);
  }
  get ClaimedRoomNames(): string[] {
    return unique(this.memory.claimedNearby ?? []);
  }

  private cachedClaimedRooms: Room[] = [];
  get ClaimedRooms(): Room[] {
    const toRemove: string[] = [];

    if (this.cachedClaimedRooms.length > 0) return this.cachedClaimedRooms;
    for (const name of this.ClaimedRoomNames) {
      const room = Game.rooms[name];
      if (room !== undefined) {
        if (room.controller === undefined || room.controller.owner === undefined)
          // Neutral Room
          this.cachedClaimedRooms.push(room);
        else if (room.controller.owner.username === 'KeyserSozayme')
          // My Room
          if (room.find(FIND_MY_SPAWNS).length === 0) {
            // Not Self-Sufficient
            this.log.info(`Claimed Room ${name} is still under support by ${this.name}!`, { '<rate>': 20 });
            this.cachedClaimedRooms.push(room);
          } else {
            // Self-Sufficient
            this.log.warn(`Claimed Room ${name} is up and running, no longer supported by ${this.name}!`);
            toRemove.push(name);
          }
        // Hostile Room
        else {
          this.log.warn(`Claimed Room ${room} is now hostile and will be removed from the claim list of ${this.name}!`);
          toRemove.push(name);
        }
      }
      // else this.log.info(`Claimed Room ${name} is not visible!`, { "<rate>": 10 });
    }

    // Remove rooms which are not claimable anymore
    this.ClaimedRoomNames = filter(this.ClaimedRoomNames, n => !toRemove.includes(n));
    return this.cachedClaimedRooms;
  }

  HostilesByRoom = this.MapWithRoomsInClaimedArea(mr => (mr instanceof Room ? mr.find(FIND_HOSTILE_CREEPS) : []));

  get EnableCostMatrixOverlay(): boolean {
    return this.memory.enableCostMatrixOverlay ?? false;
  }
  set EnableCostMatrixOverlay(value: boolean) {
    this.memory.enableCostMatrixOverlay = value;
  }

  // We return the cached matrix from the property if it is defined,
  // Otherwise we check memory and deserialize it from there,
  // then cache that as a property for fast access in the same tick.
  private cachedDeserializedCostMatrix?: CostMatrix;
  get PathfindingCostMatrix(): CostMatrix {
    // Return from cached property
    if (this.cachedDeserializedCostMatrix !== undefined) return this.cachedDeserializedCostMatrix;

    // Return from memory, and update cache
    if (this.memory.pathfindingCostMatrix !== undefined) {
      this.cachedDeserializedCostMatrix = PathFinder.CostMatrix.deserialize(this.memory.pathfindingCostMatrix);
      return this.cachedDeserializedCostMatrix;
    }

    // Not in memory or cache, call update function.
    this.UpdateCostMatrix();

    // If still undefined, then there was an error
    if (this.memory.pathfindingCostMatrix === undefined)
      throw new Error('Cost Matrix was undefined after calling UpdateCostMatrix().');

    // Return from memory, and update cache
    this.cachedDeserializedCostMatrix = PathFinder.CostMatrix.deserialize(this.memory.pathfindingCostMatrix);
    return this.cachedDeserializedCostMatrix;
  }

  public ClearCostMatrix(): void {
    this.cachedDeserializedCostMatrix = undefined;
    this.memory.pathfindingCostMatrix = undefined;
    this.memory.pathfindingCostMatrixDate = undefined;
  }

  get PathfindingCostMatrixDate(): number {
    return this.memory.pathfindingCostMatrixDate ?? 0;
  }
  private set PathfindingCostMatrixDate(value: number) {
    this.memory.pathfindingCostMatrixDate = value;
  }

  PathfindingParams = {
    RoadCost: 1,
    SourceRadius: 3, // The radius around each source to apply a bias
    SourceBiasMax: 5, // Start biasing at Sources with this cost (since sources are unwalkable so only applies for Radius >= 1 )
    SourceBiasMin: 3, // Do not bias lower than this cost around Sources
    SourceBiasFalloff: 1, // Decrease the cost by this much per additional radius
    Unwalkable: 0xff,
  };

  private UpdateCostMatrix(): void {
    this.log.info(`Updating Cost Matrix...`);
    const matrix = new PathFinder.CostMatrix();
    const terrain = this.getTerrain();

    // Set roads to cheapest cost
    for (const s of this.find(FIND_STRUCTURES, { filter: st => st.structureType === STRUCTURE_ROAD }))
      matrix.set(s.pos.x, s.pos.y, this.PathfindingParams.RoadCost);

    // Blot out pathing around sources, since they tend to crowd
    this.find(FIND_SOURCES).forEach(source => {
      /*
        "Ring Search" Algorithm
        -----------------------

        Given the origin point (`x`, `y`), and radius `r` find the positions at `O`

         - <- x -> +
        -
        ^
        |          r=0
        y    O     H=1
        |          W=1
        v          T=1
        +
            OOO    r=1
            OxO    H=3
            OOO    W=1
                   T=8
           OOOOO
           OxxxO   r=2
           OxxxO   H=5
           OxxxO   W=3
           OOOOO   T=16

          OOOOOOO
          OxxxxxO
          OxxxxxO   r=3
          OxxxxxO   H=7
          OxxxxxO   W=5
          OxxxxxO   T=24
          OOOOOOO

        r=0,H=1,W=1,T=1;pos=[(x, y)]
        r=1,H=3,W=1,T=8;pos=[HPosL=(x-1, y-1),(x-1, y-0),(x-1, y+1),    HPosR=(x+1, y-1),(x+1, y-0), (x+1, y+1)    WTop=(x-0, y-1),    WBot=(x-0, y+1)]
        r=2,H=5,W=3,T=16;pos=[HPosL=(x-2, y-1),(x-2, y-0),(x-2, y+1),(x-2, y-2),(x-2, y+2),   HPosR=...   WTop=(x-1, y-2),(x-0, y-2),(x+1, y-2),  WBot=...]
      */

      // For each 'ring' in the radii
      for (let r = 0; r < this.PathfindingParams.SourceRadius; r++) {
        // Determine a bias weight for this ring
        const weight = Math.max(
          this.PathfindingParams.SourceBiasMin,
          this.PathfindingParams.SourceBiasMax - r * this.PathfindingParams.SourceBiasFalloff,
        );

        // Set weight of Origin Point
        if (r === 0 && terrain.get(source.pos.x, source.pos.y) !== TERRAIN_MASK_WALL)
          matrix.set(source.pos.x, source.pos.y, weight);
        else {
          // Set weight of ascending left and right columns
          for (const yOff of range(-r, r + 1)) {
            if (terrain.get(source.pos.x - r, source.pos.y + yOff) !== TERRAIN_MASK_WALL)
              matrix.set(source.pos.x - r, source.pos.y + yOff, weight); // Left side
            if (terrain.get(source.pos.x + r, source.pos.y + yOff) !== TERRAIN_MASK_WALL)
              matrix.set(source.pos.x + r, source.pos.y + yOff, weight); // Right side
          }

          // Set weight of ascending top and bottom rows (except the corners)
          const xOffs = r === 1 ? [0] : range(-(r - 1), r);
          for (const xOff of xOffs) {
            if (terrain.get(source.pos.x + xOff, source.pos.y - r) !== TERRAIN_MASK_WALL)
              matrix.set(source.pos.x + xOff, source.pos.y - r, weight); // Top side
            if (terrain.get(source.pos.x + xOff, source.pos.y + r) !== TERRAIN_MASK_WALL)
              matrix.set(source.pos.x + xOff, source.pos.y + r, weight); // Bottom Side
          }
        }
      }
    });

    // Blot out unwalkable structures
    for (const s of this.find(FIND_STRUCTURES, {
      filter: st =>
        st.structureType !== STRUCTURE_ROAD &&
        st.structureType !== STRUCTURE_CONTAINER &&
        (st.structureType !== STRUCTURE_RAMPART || !st.my),
    }))
      matrix.set(s.pos.x, s.pos.y, this.PathfindingParams.Unwalkable);

    // Cache
    this.cachedDeserializedCostMatrix = matrix;

    // Memoize
    this.memory.pathfindingCostMatrix = matrix.serialize();
    this.PathfindingCostMatrixDate = Game.time;
  }

  private set EventCounts(value: Dictionary<number>) {
    this.memory.eventCounts = value;
  }
  get EventCounts(): Dictionary<number> {
    return this.memory.eventCounts ?? {};
  }

  private set EventAmounts(value: Dictionary<number>) {
    this.memory.eventAmounts = value;
  }
  get EventAmounts(): Dictionary<number> {
    return this.memory.eventAmounts ?? {};
  }

  get ClaimedMines(): [Room | string, MiningPosition[]][] {
    return this.MapWithRoomsInClaimedArea(cr => {
      // If it's a RoomExtra, return the Mines property from it.
      if (cr instanceof RoomExtra) return cr.Mines;
      const name = cr instanceof Room ? cr.name : cr;

      // Otherwise, if there is a scouting report with mines, return those
      if (Memory.scoutingReports && Memory.scoutingReports[name] && Memory.scoutingReports[name].mines)
        return Memory.scoutingReports[name].mines;

      // Since cr must be a string, there is nothing more we can do.
      // The room must be invisible, and we can't fetch them for invisible rooms if we don't
      // Have them scouted already.
      if (!(cr instanceof Room)) return [];

      // Otherwise, update the existing scouting report's mines, and return those
      if (Memory.scoutingReports && Memory.scoutingReports[name]) {
        const mines = GetMiningPositions(cr);
        Memory.scoutingReports[name].mines = mines;
        return mines;
      }

      // Otherwise, make a whole new scouting report for the room and return the mines from that
      const report = MakeRoomReport(cr);
      Memory.scoutingReports = { [name]: report };
      return report.mines;
    }, true);
  }

  get ClaimedSources(): Id<Source>[] {
    return unique(flatten(this.ClaimedMines.map(pair => pair[1].map(mp => mp.source))));
  }

  /**
   * Get positions next to Sources that are not the target of any other miners in the colony.
   */
  AvailableMiningPositions(): MiningPosition[] {
    const ret = [];
    const assignedMiningPositions = this.colony.GetAllAssignedTasks(TaskAction.Mine).map(p => (p as Mine).target);
    for (const [_room, mines] of this.ClaimedMines)
      for (const mine of mines) if (!assignedMiningPositions.some(amp => amp.source === mine.source)) ret.push(mine);
    return ret;
  }

  /**
   * Get unoccupied positions next to Sources. Positions may already have miners allocated to them.
   */
  UnfilledMiningPositions(): MiningPosition[] {
    const ret = [];
    for (const [_room, mines] of this.ClaimedMines)
      for (const mine of mines) if (DeserializeRoomPosition(mine.pos).lookFor(LOOK_CREEPS).length === 0) ret.push(mine);
    return ret;
  }

  LastSpawnTick(roleName: string): number {
    return (this.memory.lastSpawnTick ?? {})[roleName] ?? 0;
  }

  SetLastSpawnTick(roleName: string, value: number): void {
    this.memory.lastSpawnTick ??= {};
    this.memory.lastSpawnTick[roleName] = value;
  }

  GetLimitOfRole(roleName: string): number {
    // Return the custom limit room memory
    const overridenQuota = (this.memory.roleLimits ?? {})[roleName];
    if (overridenQuota !== undefined) return overridenQuota;

    // Otherwise, return the quota from the role instance.
    return this.colony.GetRole(roleName).GetRoomQuota(this);
  }

  get SpawnsOrExtensions(): (StructureExtension | StructureSpawn)[] {
    return this.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION,
    });
  }

  get Hostiles(): Creep[] {
    return this.find(FIND_HOSTILE_CREEPS);
  }

  get ConstructionSites(): ConstructionSite[] {
    const constructionGetter = (r: Room) => r.find(FIND_MY_CONSTRUCTION_SITES);
    let ret = [...constructionGetter(this)];
    for (const claimed of this.ClaimedRooms) ret = ret.concat(...constructionGetter(claimed));
    return ret;
  }

  public get HostileInfo(): HostileInfo[] {
    return GetHostileInfo(this);
  }

  get AvailableSpawns(): StructureSpawn[] {
    return this.find(FIND_MY_SPAWNS, { filter: s => !s.spawning });
  }

  get Towers(): StructureTower[] {
    return this.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER });
  }

  public get Sources(): Source[] {
    return this.find(FIND_SOURCES);
  }

  get Containers(): StructureContainer[] {
    const containerGetter = (r: Room) =>
      r.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER });
    let ret = [...containerGetter(this)];
    for (const claimed of this.ClaimedRooms) ret = ret.concat(...containerGetter(claimed));
    return ret as StructureContainer[];
  }

  get Repairs(): AnyStructure[] {
    const repairGetter = (r: Room) => r.find(FIND_STRUCTURES, { filter: s => s.hits < s.hitsMax });
    let ret = [...repairGetter(this)];
    for (const claimed of this.ClaimedRooms) ret = ret.concat(...repairGetter(claimed));
    return ret;
  }

  get Ramparts(): StructureRampart[] {
    return this.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_RAMPART });
  }

  get Roads(): StructureRoad[] {
    return this.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_ROAD });
  }

  get LinkReceivers(): StructureLink[] {
    const ret = [];
    for (const id of this.LinkGroups.Receivers ?? []) {
      const obj = Game.getObjectById(id);
      if (!obj) continue;
      else ret.push(obj);
    }
    return ret;
  }

  get LinkSenders(): StructureLink[] {
    const ret = [];
    for (const id of this.LinkGroups.Senders ?? []) {
      const obj = Game.getObjectById(id);
      if (!obj) continue;
      else ret.push(obj);
    }
    return ret;
  }

  MapWithRoomsInClaimedArea<T>(
    mapper: (r: RoomExtra | Room | string) => T[],
    includeMainRoom = true,
  ): [Room | string, T[]][] {
    const allClaimedRooms = this.ClaimedRoomNames;
    const visibleRooms = this.ClaimedRooms.concat(includeMainRoom ? [this] : []);
    const ret: [Room | string, T[]][] = [];

    for (const room of visibleRooms) ret.push([room, mapper(room)]);

    for (const name of allClaimedRooms) ret.push([name, mapper(name)]);

    return ret;
  }

  FlatMapOverRoomsInClaimedArea<T>(mapper: (r: RoomExtra | Room | string) => T[], includeMainRoom = true): T[] {
    return flatten(this.MapWithRoomsInClaimedArea(mapper, includeMainRoom).map(v => v[1]));
  }

  CleanupDeadCreeps(): void {
    for (const name in Memory.creeps) {
      // If the creep is dead and was assigned to this room
      if (!(name in Game.creeps) && Memory.creeps[name].room === this.name) {
        this.log.info(`Generic Cleanup memory for ${name}`);
        const oldMem = Memory.creeps[name];
        delete Memory.creeps[name];

        // Invoke the role cleanup if they had a role
        if (oldMem.role) {
          const role = this.colony.GetRole(oldMem.role);
          if (role) role.OnCleanup(this, name, oldMem);
        }
      }
    }
  }

  ResetEvents(): void {
    this.EventCounts = {};
    this.EventAmounts = {};
  }

  EventToName(e: EventConstant): string {
    switch (e) {
      case EVENT_ATTACK:
        return 'EVENT_ATTACK';
      case EVENT_OBJECT_DESTROYED:
        return 'EVENT_OBJECT_DESTROYED';
      case EVENT_ATTACK_CONTROLLER:
        return 'EVENT_ATTACK_CONTROLLER';
      case EVENT_BUILD:
        return 'EVENT_BUILD';
      case EVENT_HARVEST:
        return 'EVENT_HARVEST';
      case EVENT_HEAL:
        return 'EVENT_HEAL';
      case EVENT_REPAIR:
        return 'EVENT_REPAIR';
      case EVENT_RESERVE_CONTROLLER:
        return 'EVENT_RESERVE_CONTROLLER';
      case EVENT_UPGRADE_CONTROLLER:
        return 'EVENT_UPGRADE_CONTROLLER';
      case EVENT_EXIT:
        return 'EVENT_EXIT';
      case EVENT_POWER:
        return 'EVENT_POWER';
      case EVENT_TRANSFER:
        return 'EVENT_TRANSFER';
      default:
        throw new Error(`Invalid EventConstant: ${e}`);
    }
  }

  AcumulateEvents(): void {
    const existingCount = this.EventCounts;
    const existingAmount = this.EventAmounts;
    const events = this.getEventLog();
    for (const e of events) {
      const name = this.EventToName(e.event);

      existingCount[name] = (existingCount[name] ?? 0) + 1;

      let amount;
      if (e.event === EVENT_ATTACK) amount = e.data.damage;
      if (e.event === EVENT_BUILD) amount = e.data.amount;
      if (e.event === EVENT_HARVEST) amount = e.data.amount;
      if (e.event === EVENT_HEAL) amount = e.data.amount;
      if (e.event === EVENT_REPAIR) amount = e.data.amount;
      if (e.event === EVENT_RESERVE_CONTROLLER) amount = e.data.amount;
      if (e.event === EVENT_UPGRADE_CONTROLLER) amount = e.data.amount;
      if (e.event === EVENT_TRANSFER) amount = e.data.amount;

      if (amount) existingAmount[name] = (existingAmount[name] ?? 0) + amount;
      else continue; // Skip events with no 'amount' field.
    }
    this.EventCounts = existingCount;
    this.EventAmounts = existingAmount;
  }

  RunCreeps(): void {
    // Run each creep in the room.
    for (const c of this.AssignedCreeps.filter(ac => !ac.spawning)) {
      if (c.currentTask === null || c.currentTask.isComplete(c)) c.ChangeTask();
      c.role.TickCreep(c);
      c.DoTask();
      c.MoveIntoRoomIfOnEdge();
    }
  }

  RunTowers(): void {
    // Run each tower in the room
    if (!this.DisableTowers) for (const tower of this.Towers) this.TickTower(tower);
  }

  RunLinks(): void {
    // Send energy across links
    for (const sender of this.LinkSenders) for (const receiver of this.LinkReceivers) this.SendLink(sender, receiver);
  }

  DrawVisuals(): void {
    if (!this.EnableVisuals) return;
    if (this.EnableRepairOverlay) this.DrawRepairOverlay();
    if (this.EnableCostMatrixOverlay) this.DrawCostMatrixOverlay();
  }

  SendLink(sender: StructureLink, receiver: StructureLink): void {
    if (!sender.isActive() || !receiver.isActive()) return; // Can't use links
    if (sender.store.getUsedCapacity(RESOURCE_ENERGY) === 0 || sender.cooldown > 0) return; // Can't / Nothing to send
    if (receiver.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return; // No ability to receive
    const ret = sender.transferEnergy(receiver);
    if (ret !== OK)
      this.log.warn(
        `Link Transfer from ${sender} (Used: ${sender.store.getUsedCapacity()}) -> ${receiver} (Free: ${receiver.store.getFreeCapacity()}) failed: ${ret}`,
      );
  }

  ReportHostiles(): void {
    if (this.HostileInfo.length >= this.HostileNotificationThreshold && Game.time % 10 === 0)
      this.log.report(`!!! Hostiles Spotted in ${this.name}:\n\t${FormatHostileInfos(this.HostileInfo)}`);
  }

  CheckSpawns(): void {
    const maxSpawns = this.AvailableSpawns.length;
    if (maxSpawns === 0) {
      this.log.debug(`Room has no available spawn points.`);
      return;
    }

    let completedSpawns = 0;

    for (const r of Object.values(this.colony.Roles)) {
      this.log.debug(`Checking Spawns for ${r.name}`);
      if (!this.IsRoleLimited(r) && r.IsSpawnNeeded(this)) {
        const name = `${r.GetNewCreepName(this)}, ${r.name}`;
        if (!this.TrySpawnRole(r, name)) continue;
        this.SetLastSpawnTick(r.name, Game.time);
        r.OnSpawnScheduled(this, name);

        // If we used up all the spawn points, then return early.
        if (++completedSpawns >= maxSpawns) return;
      }
    }
  }

  TrySpawnRole(role: CreepRole, name: string): boolean {
    const body = role.GetNewCreepBody(this);
    const cost = BodyCost(body);

    if (this.energyAvailable < cost) {
      this.log.info(
        `Room lacks the energy to spawn (need ${cost} have ${this.energyAvailable}/${this.energyCapacityAvailable}).`,
        { '<role>': role, '<rate>': 10 },
      );
      return false; // No point proceeding
    }

    for (const sp of this.AvailableSpawns) {
      // Get directions to surrounding roads
      const nearbyRoads = sp.pos.findInRange(this.Roads, 1).map(nr => sp.pos.getDirectionTo(nr.pos.x, nr.pos.y));

      // Try to do the spawn
      const result = sp.spawnCreep(body, name, {
        directions: nearbyRoads.length > 0 ? nearbyRoads : undefined,
        memory: {
          room: this.name,
          role: role.name,
          stuckTicks: 0,
          lastPos: SerializeRoomPosition(sp.pos),
          spawning: true,
        },
      });

      // Log the result
      if (result === OK) {
        this.log.info(`Spawning ${name} ${cost} @ ${sp}...`, { '<role>': role });
        return true;
      } else {
        this.log.info(`Attempt to spawn ${name} ${cost} at ${sp} resulted in: ${result}...`, { '<role>': role });
        return false;
      }
    }
    return false;
  }

  IsRoleLimited(role: CreepRole): boolean {
    const roomQuota = this.GetLimitOfRole(role.name);
    const roomCount = role.GetRoomCreepsInRole(this).length;
    return roomCount >= roomQuota;
  }

  RoomStateReport(): string {
    let msg = '';
    let totalRoles = 0;
    let spawned = 0;

    // Build a string of role populations
    for (const name of Array.from(Object.keys(this.colony.Roles)).sort()) {
      totalRoles++;
      const role = this.colony.Roles[name];
      if (!role) {
        this.log.crit(`No instance for ${name}`);
        continue;
      }

      const spawnNeeded = role.IsSpawnNeeded(this);
      const spawnAble = this.IsRoleLimited(role);
      const spawnableStr = spawnAble ? '+' : '';
      const spawnNeededStr = spawnNeeded ? '*' : '';
      const roomQuota = this.GetLimitOfRole(name);
      const roomCount = role.GetRoomCreepsInRole(this).length;

      if (spawnNeeded || spawnAble || roomCount > 0) {
        msg += ` [${name}${spawnNeededStr}${spawnableStr} ${roomCount}/${roomQuota}]`;
        spawned++;
      }
    }

    const ownedStatus = this.parent !== undefined ? `Claimed by ${this.parent.name}` : `HQ`;

    // Prepend a leader to the populations string.
    msg =
      `${this.name} (${ownedStatus}) ::: ${spawned}/${totalRoles} Roles, ${this.AssignedCreeps.length} Assigned Creeps` +
      msg;

    if (this.storage)
      msg += ` ENERGY IN STORAGE: ${FmtRatios(this.storage.store.getUsedCapacity(RESOURCE_ENERGY), this.storage.store.getCapacity(RESOURCE_ENERGY), true, [], 3, 'K', 1000)}`;

    if (!this.controller) throw new Error(`RoomExtra is an owned room, therefore should never not have a controller.`);

    const nextLevelStr = this.controller.level === 8 ? '' : ` -> ${this.controller.level + 1}`;
    const downgradeMaintenanceThreshold =
      CONTROLLER_DOWNGRADE[this.controller.level] * UpdateController.DowngradeMaintenanceRatio;
    const downgradeStr =
      this.controller.ticksToDowngrade < downgradeMaintenanceThreshold
        ? ` , Downgrade in ${this.controller.ticksToDowngrade}`
        : '';
    msg += ` CONTROLLER ${this.controller.level}${nextLevelStr} ${FmtRatios(this.controller.progress, this.controller.progressTotal, true, [], 3, 'K', 1000)}${downgradeStr}`;

    // Append hostile details
    if (this.HostileInfo.length) {
      msg += `\nHOSTILES ${this.HostileInfo.length} :::\n`;
      msg += `\t${FormatHostileInfos(this.HostileInfo)}`;
    }

    // Get info about claimed sources
    msg += `\n\tClaimedSources: ${[...this.ClaimedSources]}`;

    // Get info about claimed rooms
    for (const claim of this.ClaimedRoomNames)
      msg += `\n\tClaims: ${claim}: Visible ${this.ClaimedRooms.map(r => r.name).includes(claim)}`;

    return msg;
  }

  DrawRepairOverlay(): void {
    for (const d of this.Repairs)
      this.visual.rect(d.pos.x - 0.5, d.pos.y - 0.5, 1, 1, {
        fill: LerpColour('#ff0000', '#00ff00', d.hits / d.hitsMax),
      });
  }

  DrawCostMatrixOverlay(): void {
    for (let x = 0; x < 50; x++)
      for (let y = 0; y < 50; y++) {
        const weight = this.PathfindingCostMatrix.get(x, y);
        if (weight > 0)
          this.visual
            .rect(x - 0.5, y - 0.5, 1, 1, { fill: LerpColour('#00ff00', '#ff0000', weight / 255) })
            .text(weight.toString(10), x, y);
      }
  }

  // List of filter callback, health capacity to begin repair, and maxRepairers, descending order.
  // prettier-ignore
  RepairPriorities: [((s: AnyStructure) => boolean), number, number][] = [
    [(s => s instanceof StructureRampart  && s.hits < 1000), 1, 1],
    [(s => s instanceof StructureRoad || s instanceof StructureContainer || s instanceof StructurePortal), 0.5, 1],
    [(s => s instanceof StructureRampart && s.hits < 1_000_000), 1, 1],
    [(s => s instanceof StructureWall && s.hits < 1_000_000), 1, 1],
    [(s => {if (
      s instanceof StructureRampart
      || s instanceof StructureContainer
      || s instanceof StructurePortal
      || s instanceof StructureRoad
      || s instanceof StructureRampart
      || s instanceof StructureWall
    ) return false; this.log.warn(`Unfiltered Repair Priority: ${s}`); return false}), 1, 1],
  ];

  FindRepairByPriorityAndStrength(limitToRoom?: RoomExtra, byRangeTo?: RoomPosition): AnyStructure | null {
    let priorityIndex = 0;
    const ongoingRepairs = this.GetAssignedTasks(TaskAction.Repair) as Repair[];
    const incoming = (s: AnyStructure) => ongoingRepairs.filter(or => or.target === s.id).length;
    const roomLimit = (s: AnyStructure) =>
      limitToRoom === undefined || (limitToRoom !== undefined && s.pos.roomName === limitToRoom.name);
    for (const [predicate, repairAt, maxWorkers] of this.RepairPriorities) {
      const candidates = this.Repairs.filter(
        s => roomLimit(s) && predicate(s) && s.hits / s.hitsMax < repairAt && incoming(s) < maxWorkers,
      );

      let selected;
      if (byRangeTo === undefined)
        // Sort by most needed
        selected = candidates.sort((b, a) => a.hits / a.hitsMax - b.hits / b.hitsMax).pop();
      else
        // Sort by range to given point
        selected = byRangeTo.findClosestByRange(candidates);

      priorityIndex++;
      if (!selected) continue;
      else return selected;
    }
    this.log.debug(`No repairs found, searched ${priorityIndex} priority groups.`);
    return null;
  }

  TickTower(tower: StructureTower) {
    const supplyRatio = tower.store.getUsedCapacity(RESOURCE_ENERGY) / tower.store.getCapacity(RESOURCE_ENERGY);
    if (!tower.isActive || !supplyRatio) return; // RCL or Energy too low to work

    // Critical Tasks - Always performed regardless of ener

    // Attacks
    if (this.Hostiles.length && this.AttackHostiles && !this.DisableTowerAttacks) {
      this.visual.circle(tower.pos, {
        radius: this.TowerAttackRange,
        stroke: Colours.ATTACK_RANGE,
        opacity: 0.1,
        strokeWidth: 0.5,
      });

      // Find lowest health hostile in range
      const weakestHostile = tower.pos
        .findInRange(this.Hostiles, this.TowerAttackRange)
        .sort((b, a) => a.hits / a.hitsMax - b.hits / b.hitsMax)
        .pop();
      if (weakestHostile) {
        const res = tower.attack(weakestHostile);
        this.log.debug(
          `!!! Tower Attacked ${weakestHostile.name} from ${weakestHostile.owner.username} (${weakestHostile.hits}/${weakestHostile.hits}) with result ${res}!`,
        );
        return;
      }
    }

    // My creeps in need of healing, weakest first
    const weakestFriendly = this.colony.MyCreeps.filter(c => c.hits < c.hitsMax)
      .sort((b, a) => a.hits / a.hitsMax - b.hits / b.hitsMax)
      .pop();
    if (weakestFriendly) {
      const res = tower.heal(weakestFriendly);
      this.log.debug(
        `Tower Healed ${weakestFriendly.name} (${weakestFriendly.hits}/${weakestFriendly.hitsMax}) with result ${res}!`,
      );
      return;
    }

    // If we have enough energy, repair the most damaged structure in the room
    if (supplyRatio >= this.TowerCriticalSupplyRatio) {
      const needRepair = this.FindRepairByPriorityAndStrength(this);
      if (needRepair) tower.repair(needRepair);
    }
  }

  BuildRoads() {
    // Check if we need to build a road.
    const start = Game.flags.RoadStart;
    const end = Game.flags.RoadEnd;
    if (start && end) {
      // Find a path in the same room
      const path = start.pos.findPathTo(end, { maxRooms: 1, swampCost: 2, plainCost: 4, ignoreCreeps: true });
      let built = false;

      if (this.createConstructionSite(start.pos.x, start.pos.y, STRUCTURE_ROAD) === OK) built = true;
      for (const pos of path) if (this.createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD) === OK) built = true;
      if (this.createConstructionSite(end.pos.x, end.pos.y, STRUCTURE_ROAD) === OK) built = true;

      if (built) {
        start.remove();
        end.remove();
      }
    }
  }
}
