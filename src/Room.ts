import { Dictionary, flatten, range, unique } from 'lodash';
import { Collect, Mine, UpgradeController } from 'tasks';
import {
  CollectionPlan,
  ContainerAndAmount,
  FormatHostileInfos,
  GetHostileInfo,
  GetMinesForRoom,
  GetMiningPositions,
  HostileInfo,
  MiningPosition,
  ResourceContainersForRoomByType,
} from 'utils/RoomUtils';
import { Colony } from 'Colony';
import { CreepExtra } from 'Creep';
import { DeserializeRoomPosition, FmtRatios, LerpColour, SerializeRoomPosition } from 'utils/Collections';
import { Colours } from 'Data';
import { CreepRole } from 'roles/Role';
import { Logger } from 'utils/Logger';
import { BodyCost } from 'utils/CreepUtils';
import { CreepTask, TaskClass } from 'tasks/types';
import {
  CreatePendingRepairs,
  FindHighestPriorityRepairGroup,
  PendingRepairs as PendingRepairCollection,
} from 'utils/RepairUtils';

declare global {
  interface RoomMemory {
    lastSpawnTick?: { [roleName: string]: number };
    roleLimits?: { [roleName: string]: number };
    enableVisuals?: boolean;
    enableRepairOverlay?: boolean;
    foreverRepair?: boolean;
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
    allowStorageDraw?: boolean;
    lastViewed?: number;
  }
}

export class RoomExtra extends Room {
  readonly colony: Colony;
  readonly log: Logger<RoomExtra> = new Logger(this, { formatArgs: { '<room>': this } });
  readonly AssignedCreeps: CreepExtra[];

  private eventsAccumulatedThisTick = false;

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
    this.AssignedCreeps = colony.MyCreeps.filter(c => c.memory.room === room.name);
  }

  private cachedAssignedCreepsOfRole: { [roleName: CreepRole['roleName']]: CreepExtra[] } = {};
  GetAssignedCreepsOfRole(roleName: string): CreepExtra[] {
    return (this.cachedAssignedCreepsOfRole[roleName] ??= this.AssignedCreeps.filter(
      c => c.role.roleName === roleName,
    ));
  }

  private cachedAssignedCreepsOfRoleGroup: { [roleGroupName: CreepRole['groupName']]: CreepExtra[] } = {};
  GetAssignedCreepsOfRoleGroup(roleGroupName: string): CreepExtra[] {
    return (this.cachedAssignedCreepsOfRole[roleGroupName] ??= this.AssignedCreeps.filter(
      c => c.role.groupName === roleGroupName,
    ));
  }

  *AssignedTasks<Task extends CreepTask = CreepTask>(taskClass?: TaskClass<Task>): IterableIterator<Task> {
    for (const [_creep, task] of this.AssignedTasksWithCreep(taskClass)) yield task;
  }

  *AssignedTasksWithCreep<Task extends CreepTask = CreepTask>(
    taskClass?: TaskClass<Task>,
  ): IterableIterator<[CreepExtra, Task]> {
    for (const c of this.AssignedCreeps)
      if (c.currentTask !== null && (taskClass === undefined || c.currentTask.action === taskClass.action))
        yield [c, c.currentTask as Task];
  }

  get StoreOverUpgrade() {
    return (this.memory.storeOverUpgrade ??= true);
  }

  get EnableRepairOverlay(): boolean {
    return (this.memory.enableRepairOverlay ??= false);
  }
  set EnableRepairOverlay(value: boolean) {
    this.memory.enableRepairOverlay = value;
  }
  get AttackHostiles(): boolean {
    return (this.memory.attackHostiles ??= true);
  }
  set AttackHostiles(value: boolean) {
    this.memory.attackHostiles = value;
  }
  get DisableWarriors(): boolean {
    return (this.memory.disableWarriors ??= false);
  }
  set DisableWarriors(value: boolean) {
    this.memory.disableWarriors = value;
  }
  get DisableTowers(): boolean {
    return (this.memory.disableTowers ??= false);
  }
  set DisableTowers(value: boolean) {
    this.memory.disableTowers = value;
  }
  get DisableTowerAttacks(): boolean {
    return (this.memory.disableTowerAttacks ??= false);
  }
  set DisableTowerAttacks(value: boolean) {
    this.memory.disableTowerAttacks = value;
  }
  get TowerAttackRange(): number {
    return (this.memory.towerAttackRange ??= 20);
  }
  set TowerAttackRange(value: number) {
    this.memory.towerAttackRange = value;
  }
  get TowerCriticalSupplyRatio(): number {
    return (this.memory.towerCriticalSupplyRatio ??= 0.75);
  }
  set TowerCriticalSupplyRatio(value: number) {
    this.memory.towerCriticalSupplyRatio = value;
  }
  get HostileNotificationThreshold(): number {
    return (this.memory.hostileNotificationThreshold ??= 2);
  }
  set HostileNotificationThreshold(value: number) {
    this.memory.hostileNotificationThreshold = value;
  }
  get StorageWartimeEnergyBuffer(): number {
    return (this.memory.storageWartimeEnergyBuffer ??= 5000);
  }
  get LinkGroups(): { [key: string]: Id<StructureLink>[] } {
    return (this.memory.linkGroups ??= {});
  }
  set LinkGroups(value: { [key: string]: Id<StructureLink>[] }) {
    this.memory.linkGroups = value;
  }
  get EnableCostMatrixOverlay(): boolean {
    return this.memory.enableCostMatrixOverlay ?? false;
  }
  set EnableCostMatrixOverlay(value: boolean) {
    this.memory.enableCostMatrixOverlay = value;
  }
  get ForeverRepairs(): boolean {
    return (this.memory.foreverRepair ??= false);
  }
  set ForeverRepairs(value: boolean) {
    this.memory.foreverRepair = value;
  }
  set Mines(value: MiningPosition[]) {
    this.memory.mines = value;
  }
  get Mines(): MiningPosition[] {
    return (this.memory.mines ??= GetMiningPositions(this));
  }
  set ClaimedRoomNames(value: string[]) {
    this.memory.claimedNearby = unique(value);
  }
  get ClaimedRoomNames(): string[] {
    return unique((this.memory.claimedNearby ??= []));
  }
  private set EventCounts(value: Dictionary<number>) {
    this.memory.eventCounts = value;
  }
  get EventCounts(): Dictionary<number> {
    return (this.memory.eventCounts ??= {});
  }
  private set EventAmounts(value: Dictionary<number>) {
    this.memory.eventAmounts = value;
  }
  get EventAmounts(): Dictionary<number> {
    return (this.memory.eventAmounts ??= {});
  }

  private cachedWorkableClaimedRooms: Room[] = [];
  get WorkableClaimedRooms(): Room[] {
    if (this.cachedWorkableClaimedRooms.length > 0) return this.cachedWorkableClaimedRooms;

    for (const name of this.ClaimedRoomNames) {
      if (name in Game.rooms) {
        const room = Game.rooms[name];
        if (room.controller === undefined || room.controller.owner === undefined)
          // Neutral Room - safe to work
          this.cachedWorkableClaimedRooms.push(room);
        else if (room.controller.owner.username === this.colony.username)
          //  My room
          if (room.find(FIND_MY_SPAWNS).length === 0) {
            // Not Self-Sufficient - keep working
            this.log.info('Claimed room is still under support.', { '<rate>': 20, claimedRoomName: name });
            this.cachedWorkableClaimedRooms.push(room);
          } else {
            // Self-Sufficient - disown
            this.log.warn('Claimed room is self-sufficient; removing support.', { claimedRoomName: name });
            this.ClaimedRoomNames = this.ClaimedRoomNames.filter(cr => cr !== name);
          }
        else if (room.find(FIND_HOSTILE_SPAWNS).length > 0)
          this.log.warn('Claimed room is hostile.', { '<rate>': 10, claimedRoomName: name });
        else this.log.warn('Claimed room is unowned and available.', { '<rate>': 10, claimedRoomName: name });
      } else {
        this.log.warn('Claimed room is not visible.', { '<rate>': 30, claimedRoomName: name });
      }
    }

    return this.cachedWorkableClaimedRooms;
  }

  get HostilesByRoom(): [string | Room | RoomExtra, Creep[]][] {
    return this.MapWithRoomsInClaimedArea(mr => (mr instanceof Room ? mr.find(FIND_HOSTILE_CREEPS) : []), true);
  }

  // We return the cached matrix from the property if it is defined,
  // Otherwise we check memory and deserialize it from there,
  // then cache that as a property for fast access in the same tick.
  private cachedDeserializedStructuresCostMatrix?: CostMatrix;
  get StructuresCostMatrix(): CostMatrix {
    // Return from cached property
    if (this.cachedDeserializedStructuresCostMatrix !== undefined) return this.cachedDeserializedStructuresCostMatrix;

    // Return from memory, and update cache
    if (this.memory.pathfindingCostMatrix !== undefined) {
      this.cachedDeserializedStructuresCostMatrix = PathFinder.CostMatrix.deserialize(
        this.memory.pathfindingCostMatrix,
      );
      return this.cachedDeserializedStructuresCostMatrix;
    }

    // Not in memory or cache, call update function.
    this.UpdateStructuresCostMatrix();

    // If still undefined, then there was an error
    if (this.memory.pathfindingCostMatrix === undefined)
      throw new Error('Cost Matrix was undefined after calling UpdateCostMatrix().');

    // Return from memory, and update cache
    this.cachedDeserializedStructuresCostMatrix = PathFinder.CostMatrix.deserialize(this.memory.pathfindingCostMatrix);
    return this.cachedDeserializedStructuresCostMatrix;
  }

  private cachedCreepsCostMatrix?: CostMatrix;
  get CreepsCostMatrix(): CostMatrix {
    if (this.cachedCreepsCostMatrix) return this.cachedCreepsCostMatrix;

    // Start from the structures matrix
    this.cachedCreepsCostMatrix = this.StructuresCostMatrix.clone();

    // Blot out the positions of all creeps in the room
    for (const creep of this.find(FIND_CREEPS))
      this.cachedCreepsCostMatrix.set(creep.pos.x, creep.pos.y, this.PathfindingParams.Unwalkable);

    // Don't bother saving the matrix since it's only valid for this tick

    return this.cachedCreepsCostMatrix;
  }

  public ClearStructureDependentData(): void {
    this.log.warn('Clearing structure-dependent room data.');

    // Clear cost matricies
    this.memory.pathfindingCostMatrix = undefined;
    this.memory.pathfindingCostMatrixDate = undefined;
    this.cachedDeserializedStructuresCostMatrix = undefined;
    this.cachedCreepsCostMatrix = undefined;

    // Also clear the list of mining positions
    this.memory.mines = undefined;
  }

  PathfindingParams = {
    RoadCost: 1,
    SourceRadius: 3, // The radius around each source to apply a bias
    SourceBiasMax: 5, // Start biasing at Sources with this cost (since sources are unwalkable so only applies for Radius >= 1 )
    SourceBiasMin: 3, // Do not bias lower than this cost around Sources
    SourceBiasFalloff: 1, // Decrease the cost by this much per additional radius
    Unwalkable: 0xff,
  };

  CostMatrixIsStale = false;
  private UpdateStructuresCostMatrix(): void {
    this.log.info('Updating cost matrix.');
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

    // Blot out unwalkable construction sites
    for (const s of this.find(FIND_CONSTRUCTION_SITES, {
      filter: st =>
        st.structureType !== STRUCTURE_ROAD &&
        st.structureType !== STRUCTURE_CONTAINER &&
        (st.structureType !== STRUCTURE_RAMPART || !st.my),
    }))
      matrix.set(s.pos.x, s.pos.y, this.PathfindingParams.Unwalkable);

    // Cache
    this.cachedDeserializedStructuresCostMatrix = matrix;

    // Memoize
    this.memory.pathfindingCostMatrix = matrix.serialize();
    this.CostMatrixIsStale = false;
  }

  get WorkableClaimedMiningPositions(): [RoomExtra | Room | string, MiningPosition[]][] {
    return this.MapWithRoomsInClaimedArea(
      cr => (cr instanceof RoomExtra ? cr.Mines : GetMinesForRoom(cr, this.colony.username)),
      true,
    );
  }

  get ClaimedSources(): (Id<Source> | Id<StructureExtractor>)[] {
    return unique(flatten(this.WorkableClaimedMiningPositions.map(pair => pair[1].map(mp => mp.source))));
  }

  /**
   * Get positions next to Sources/Extractors that are not the target of any other miners in the colony.
   */
  AvailableMiningPositions(): MiningPosition[] {
    const ret = [];
    const assignedMiningPositions = [...this.AssignedTasks(Mine)].map(p => p.miningPosition);
    for (const [_room, mines] of this.WorkableClaimedMiningPositions)
      for (const mine of mines) if (!assignedMiningPositions.some(amp => amp.source === mine.source)) ret.push(mine);
    return ret;
  }

  /**
   * Get unoccupied positions next to Sources/Extractors. Positions may already have miners allocated to them.
   */
  UnfilledMiningPositions(): MiningPosition[] {
    const ret = [];
    for (const [_room, mines] of this.WorkableClaimedMiningPositions)
      for (const mine of mines) {
        const pos = DeserializeRoomPosition(mine.pos);
        if (!(pos.roomName in Game.rooms)) {
          // If we can't see the room, it must be free.
          ret.push(mine);
          continue;
        }

        // If we can see the room, rule out positions that are filled
        if (pos.lookFor(LOOK_CREEPS).length === 0) ret.push(mine);
      }
    return ret;
  }

  LastSpawnTick(roleName: string): number {
    return ((this.memory.lastSpawnTick ??= {})[roleName] ??= 0);
  }

  SetLastSpawnTick(roleName: string, value: number): void {
    (this.memory.lastSpawnTick ??= {})[roleName] = value;
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
    for (const claimed of this.WorkableClaimedRooms) ret = ret.concat(...constructionGetter(claimed));
    return ret;
  }

  public get HostileInfo(): HostileInfo[] {
    return GetHostileInfo(this);
  }

  get ClaimedContainers(): StructureContainer[] {
    return this.FlatMapOverRoomsInClaimedArea(r =>
      typeof r === 'string' ? [] : r.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER }),
    );
  }

  get ClaimedRepairs(): AnyStructure[] {
    return this.FlatMapOverRoomsInClaimedArea(r => (r instanceof Room ? CreatePendingRepairs(r).candidates : []));
  }

  private cachedPendingRepairs?: PendingRepairCollection;
  get PendingRepairs(): PendingRepairCollection {
    return (this.cachedPendingRepairs ??= CreatePendingRepairs(this));
  }

  get PendingRepairGroup() {
    return FindHighestPriorityRepairGroup(this, this.PendingRepairs);
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
      // Skip if missing, or still under construction
      if (!obj || typeof obj.isActive !== 'function') continue;
      else ret.push(obj);
    }
    return ret;
  }

  get LinkSenders(): StructureLink[] {
    const ret = [];
    for (const id of this.LinkGroups.Senders ?? []) {
      const obj = Game.getObjectById(id);
      // Skip if missing, or still under construction
      if (!obj || typeof obj.isActive !== 'function') continue;
      else ret.push(obj);
    }
    return ret;
  }

  private cachedCollectionPlan?: CollectionPlan;
  get CollectionPlan() {
    return (this.cachedCollectionPlan ??= this.CreateCollectionPlan());
  }

  CreateCollectionPlan(): CollectionPlan {
    const sourcesByType = new Map<ResourceConstant, ContainerAndAmount[]>();
    for (const room of [this, ...this.WorkableClaimedRooms])
      for (const [resourceType, sources] of ResourceContainersForRoomByType(room)) {
        const existing = sourcesByType.get(resourceType);
        if (existing) existing.push(...sources);
        else sourcesByType.set(resourceType, sources);
      }

    const reservedCapacityBySource = new Map<string, number>();
    for (const [collector, task] of this.AssignedTasksWithCreep(Collect)) {
      const sourceId = task.targetId;
      reservedCapacityBySource.set(
        sourceId,
        (reservedCapacityBySource.get(sourceId) ?? 0) + collector.store.getFreeCapacity(),
      );
    }

    return { sourcesByType, reservedCapacityBySource };
  }

  MapWithRoomsInClaimedArea<T>(
    mapper: (r: RoomExtra | Room | string) => T,
    includeMainRoom = true,
  ): [RoomExtra | Room | string, T][] {
    const ret: [RoomExtra | Room | string, T][] = [];

    if (includeMainRoom) ret.push([this, mapper(this)]);
    for (const name of this.ClaimedRoomNames) {
      const otherRoom = this.colony.Rooms.get(name);
      if (otherRoom && !otherRoom.controller?.my) ret.push([otherRoom, mapper(otherRoom)]);
      else ret.push([name, mapper(name)]);
    }

    return ret;
  }

  FlatMapOverRoomsInClaimedArea<E>(mapper: (r: RoomExtra | Room | string) => E[], includeMainRoom = true): E[] {
    return flatten(this.MapWithRoomsInClaimedArea(mapper, includeMainRoom).map(r => r[1]));
  }

  CleanupDeadCreeps(): void {
    for (const name in Memory.creeps) {
      // If the creep is dead and was assigned to this room
      if (!(name in Game.creeps) && Memory.creeps[name].room === this.name) {
        this.log.info('Cleaning up memory for a dead creep.', { creepName: name });
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
    if (this.eventsAccumulatedThisTick) return;
    this.eventsAccumulatedThisTick = true;

    const existingCount = this.EventCounts;
    const existingAmount = this.EventAmounts;
    const events = this.getEventLog();
    for (const e of events) {
      const name = this.EventToName(e.event);

      // Increment Count of Event Type
      existingCount[name] = (existingCount[name] ?? 0) + 1;

      // Fetch amount
      let amount;
      if (e.event === EVENT_ATTACK) amount = e.data.damage;
      if (e.event === EVENT_BUILD) amount = e.data.amount;
      if (e.event === EVENT_HARVEST) amount = e.data.amount;
      if (e.event === EVENT_HEAL) amount = e.data.amount;
      if (e.event === EVENT_REPAIR) amount = e.data.amount;
      if (e.event === EVENT_RESERVE_CONTROLLER) amount = e.data.amount;
      if (e.event === EVENT_UPGRADE_CONTROLLER) amount = e.data.amount;
      if (e.event === EVENT_TRANSFER) amount = e.data.amount;

      // Acumuate Amount of Event Type if it had one
      if (amount) existingAmount[name] = (existingAmount[name] ?? 0) + amount;

      // Mark cost matrix as stale for events that change room structures
      if (
        e.event === EVENT_ATTACK_TYPE_NUKE ||
        (e.event === EVENT_OBJECT_DESTROYED && e.data.type !== 'creep') ||
        (e.event === EVENT_BUILD && !e.data.incomplete) ||
        (e.event === EVENT_ATTACK_TYPE_DISMANTLE && !e.data.incomplete)
      )
        this.CostMatrixIsStale = true;
    }
    this.EventCounts = existingCount;
    this.EventAmounts = existingAmount;
  }

  RunCreeps(): void {
    for (const role of Object.values(this.colony.Roles)) role.RoomTickStart(this);

    // Run each creep in the room.
    for (const c of this.AssignedCreeps.filter(ac => !ac.spawning)) {
      c.role.TickCreep(c);
      for (let i = 0; i < c.MaxTasksToAttemptPerTick; i++) c.DoTask();
      c.MoveIntoRoomIfOnEdge();
    }
  }

  RunTowers(): void {
    if (this.DisableTowers) return;

    const towers = this.find(FIND_MY_STRUCTURES, {
      filter: (s): s is StructureTower => s.structureType === STRUCTURE_TOWER,
    });
    if (towers.length === 0) return;

    const hostiles = this.Hostiles;
    let weakestFriendly: Creep | undefined;
    let lowestFriendlyHealth = Infinity;
    for (const creep of this.colony.MyCreeps) {
      if (creep.hits >= creep.hitsMax) continue;
      const healthRatio = creep.hits / creep.hitsMax;
      if (healthRatio <= lowestFriendlyHealth) {
        weakestFriendly = creep;
        lowestFriendlyHealth = healthRatio;
      }
    }

    for (const tower of towers) this.TickTower(tower, hostiles, weakestFriendly);
  }

  RunLinks(): void {
    // Send energy across links
    for (const sender of this.LinkSenders) for (const receiver of this.LinkReceivers) this.SendLink(sender, receiver);
  }

  DrawVisuals(): void {
    // If we were not viewing the room in the browser recently, skip
    if (Game.time - (this.memory.lastViewed ?? 0) > 10) return;
    if (this.EnableRepairOverlay) this.DrawRepairOverlay();
    if (this.EnableCostMatrixOverlay) this.DrawCostMatrixOverlay();
  }

  SendLink(sender: StructureLink, receiver: StructureLink): void {
    if (!sender.isActive() || !receiver.isActive()) return; // Can't use links
    if (sender.store.getUsedCapacity(RESOURCE_ENERGY) === 0 || sender.cooldown > 0) return; // Can't / Nothing to send
    if (receiver.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return; // No ability to receive
    const ret = sender.transferEnergy(receiver);
    if (ret !== OK)
      this.log.warn('Link energy transfer failed.', {
        sender: sender.id,
        senderUsedCapacity: sender.store.getUsedCapacity(),
        receiver: receiver.id,
        receiverFreeCapacity: receiver.store.getFreeCapacity(),
        result: ret,
      });
  }

  ReportHostiles(): void {
    if (this.HostileInfo.length >= this.HostileNotificationThreshold && Game.time % 10 === 0)
      this.log.report('Hostiles spotted.', { hostiles: this.HostileInfo });
  }

  GetSpawnableRoles(): SpawnableRoleDetails[] {
    const rolesSpawnable: SpawnableRoleDetails[] = [];
    for (const role of Object.values(this.colony.Roles)) {
      const roomQuota = role.GetQuota(this);
      const roomCount = role.GetRoomCreepsInRole(this).length;
      const timeSinceLastSpawn = Game.time - this.LastSpawnTick(role.roleName);

      if (role.IsSpawnNeeded(this)) {
        const name = `${role.GetNewCreepName(this)}, ${role.roleName}`;
        const body = role.GetNewCreepBody(this);
        const available = this.energyAvailable;
        const needed = BodyCost(body);
        if (available < needed) continue;
        rolesSpawnable.push({ role, name, body, available, needed, roomQuota, roomCount, timeSinceLastSpawn });
      }
    }
    return rolesSpawnable;
  }

  private spawnBlocked = false;
  CheckSpawns(): void {
    if (this.spawnBlocked) return;

    const maxSpawns = this.find(FIND_MY_SPAWNS, { filter: s => !s.spawning }).length;
    if (maxSpawns === 0) {
      this.log.info('All spawns are in use.', { '<rate>': 20 });
      this.spawnBlocked = true;
      return;
    }

    const spawnable = this.GetSpawnableRoles().sort((a, b) => a.role.priority - b.role.priority);
    if (spawnable.length === 0) {
      this.spawnBlocked = true;
      return;
    }

    let completedSpawns = 0;
    this.log.info('Attempting Spawns.', {
      spawnable: spawnable.map(s => [s.role.roleName, s.name]),
      completedSpawns,
      maxSpawns,
    });

    for (const { role, name, body, available, needed, roomCount, roomQuota, timeSinceLastSpawn } of spawnable) {
      const success = this.TrySpawnRole(role, name, body);
      if (!success) {
        this.log.crit('Spawn failed despite having enough energy.', {
          '<role>': role,
          priority: role.priority,
          roomCount,
          roomQuota,
          timeSinceLastSpawn,
          available,
          needed,
        });
        continue;
      }

      this.log.info('Spawn scheduled successfully.', {
        '<role>': role,
        priority: role.priority,
        roomCount,
        roomQuota,
        timeSinceLastSpawn,
        available,
        needed,
      });
      this.SetLastSpawnTick(role.roleName, Game.time);
      role.OnSpawnScheduled(this, name);

      // If we used up all the spawn points, then return early.
      if (++completedSpawns >= maxSpawns) {
        this.spawnBlocked = true;
        return;
      }
    }
  }

  TrySpawnRole(role: CreepRole, name: string, body: BodyPartConstant[]): boolean {
    for (const sp of this.find(FIND_MY_SPAWNS, { filter: s => !s.spawning })) {
      // Get directions to surrounding roads
      const nearbyRoads = sp.pos.findInRange(this.Roads, 1).map(nr => sp.pos.getDirectionTo(nr.pos.x, nr.pos.y));

      // Try to do the spawn
      const result = sp.spawnCreep(body, name, {
        directions: nearbyRoads.length > 0 ? nearbyRoads : undefined,
        memory: {
          room: this.name,
          role: role.roleName,
          stuckTicks: 0,
          lastPos: SerializeRoomPosition(sp.pos),
          spawning: true,
        },
      });
      return result === OK;
    }
    return false;
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
        this.log.crit('Role registry has no instance.', { roleName: name });
        continue;
      }

      const spawnNeeded = role.IsSpawnNeeded(this);
      const roomQuota = role.GetQuota(this);
      const roomCount = role.GetRoomCreepsInRole(this).length;
      const spawnable = roomCount >= roomQuota;
      const spawnableStr = spawnable ? '+' : '';
      const spawnNeededStr = spawnNeeded ? '*' : '';

      if (spawnNeeded || spawnable || roomCount > 0) {
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
      CONTROLLER_DOWNGRADE[this.controller.level] * UpgradeController.DowngradeMaintenanceRatio;
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
      msg += `\n\tClaims: ${claim}: Visible ${this.WorkableClaimedRooms.map(r => r.name).includes(claim)}`;

    return msg;
  }

  DrawRepairOverlay(): void {
    for (const d of this.ClaimedRepairs)
      this.visual.rect(d.pos.x - 0.5, d.pos.y - 0.5, 1, 1, {
        fill: LerpColour('#ff0000', '#00ff00', d.hits / d.hitsMax),
      });
  }

  DrawCostMatrixOverlay(): void {
    for (let x = 0; x < 50; x++)
      for (let y = 0; y < 50; y++) {
        const weight = this.CreepsCostMatrix.get(x, y);
        if (weight > 0)
          this.visual
            .rect(x - 0.5, y - 0.5, 1, 1, { fill: LerpColour('#00ff00', '#ff0000', weight / 255) })
            .text(weight.toString(10), x, y);
      }
  }

  TickTower(tower: StructureTower, hostiles: Creep[], weakestFriendly?: Creep) {
    const supplyRatio = tower.store.getUsedCapacity(RESOURCE_ENERGY) / tower.store.getCapacity(RESOURCE_ENERGY);
    if (!tower.isActive || !supplyRatio) return; // RCL or Energy too low to work

    // Critical Tasks - Always performed regardless of ener

    // Attacks
    if (hostiles.length && this.AttackHostiles && !this.DisableTowerAttacks) {
      this.visual.circle(tower.pos, {
        radius: this.TowerAttackRange,
        stroke: Colours.ATTACK_RANGE,
        opacity: 0.1,
        strokeWidth: 0.5,
      });

      // Find lowest health hostile in range
      let weakestHostile: Creep | undefined;
      let lowestHostileHealth = Infinity;
      for (const hostile of hostiles) {
        if (tower.pos.getRangeTo(hostile.pos) > this.TowerAttackRange) continue;
        const healthRatio = hostile.hits / hostile.hitsMax;
        if (healthRatio <= lowestHostileHealth) {
          weakestHostile = hostile;
          lowestHostileHealth = healthRatio;
        }
      }
      if (weakestHostile) {
        const res = tower.attack(weakestHostile);
        this.log.debug('Tower attacked a hostile creep.', {
          targetName: weakestHostile.name,
          owner: weakestHostile.owner.username,
          hits: weakestHostile.hits,
          hitsMax: weakestHostile.hitsMax,
          result: res,
        });
        return;
      }
    }

    // My creeps in need of healing, weakest first
    if (weakestFriendly) {
      const res = tower.heal(weakestFriendly);
      this.log.debug('Tower healed a friendly creep.', {
        targetName: weakestFriendly.name,
        hits: weakestFriendly.hits,
        hitsMax: weakestFriendly.hitsMax,
        result: res,
      });
      return;
    }

    // If we have enough energy, repair the most damaged structure in the room
    if (supplyRatio >= this.TowerCriticalSupplyRatio) {
      const repairGroup = FindHighestPriorityRepairGroup(this, this.PendingRepairs);
      if (repairGroup) {
        const target = repairGroup.repairs.reduce(
          (best, candidate) => {
            const targetRange = tower.pos.getRangeTo(candidate);
            const falloff = Math.min(
              1,
              (TOWER_FALLOFF * Math.max(0, targetRange - TOWER_OPTIMAL_RANGE)) / TOWER_FALLOFF_RANGE,
            );
            const effectivePower = TOWER_POWER_REPAIR * (1 - falloff);
            if (!best || effectivePower > best.effectivePower) return { structure: candidate, effectivePower };
            return best;
          },
          undefined as { structure: AnyStructure; effectivePower: number } | undefined,
        );
        if (target) tower.repair(target.structure);
      }
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

interface SpawnableRoleDetails {
  role: CreepRole;
  name: string;
  body: BodyPartConstant[];
  available: number;
  needed: number;
  roomQuota: number;
  roomCount: number;
  timeSinceLastSpawn: number;
}
