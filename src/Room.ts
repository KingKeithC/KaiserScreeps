import { Colony } from "Colony";
import { CreepExtra } from "Creep";
import { Colours } from "Data";
import { Dictionary, unique } from "lodash";
import { CreepRole } from "roles/Role";
import { CreepTask, TaskAction, Mine, UpdateController } from "tasks";
import { FmtRatios, LerpColour } from "utils/Collections";
import { Logger } from "utils/Logger";
import { MiningPosition, GetMinerPositions, HostileInfo, GetHostileInfo, FormatHostileInfos } from "utils/RoomUtils";


declare global {
  interface RoomMemory {
    lastSpawnTick: { [roleName: string]: number; };
    quotas?: { [roleName: string]: number; };
    enableVisuals?: boolean,
    enableRepairOverlay?: boolean,
    attackHostiles: boolean,
    disableWarriors: boolean,
    disableTowers: boolean,
    disableTowerAttacks: boolean,
    towerAttackRange: number,
    towerAttackRangeTiles?: number;
    towerCriticalSupplyRatio?: number;
    hostileNotificationThreshold?: number;
    claimedNearby?: string[],
    minerPositions?: MiningPosition[],
    storageWartimeEnergyBuffer: number,
    linkGroups?: Dictionary<Id<StructureLink>[]>,
  }
}

interface EventSummary {
  time: number,
  event: string,
  summary: string,
  value: number | null,
}

export class RoomExtra extends Room {
  readonly colony: Colony;
  readonly log: Logger<RoomExtra> = new Logger(this, { formatArgs: { "<room>": this } });
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
    this.AssignedCreeps = colony.MyCreeps.filter(c => c.memory.room === this.name);
    this.AssignedCreepsByRoleName = new Map();
    this.AssignedCreepsByRoleGroup = new Map();
    for (const c of this.AssignedCreeps) {
      if (!c.role) continue;
      this.AssignedCreepsByRoleName.set(c.role.name, [...this.AssignedCreepsByRoleName.get(c.role.name) ?? [], c]);
      this.AssignedCreepsByRoleGroup.set(c.role.groupName, [...this.AssignedCreepsByRoleGroup.get(c.role.groupName) ?? [], c]);
    }
  }

  GetAssignedTasks(taskAction?: string): CreepTask[] {
    const tasks = this.AssignedCreeps
      .filter(c => c.memory.jobMemory != null && c.memory.jobMemory != undefined)
      .map(c => c.memory.jobMemory as CreepTask);

    if (!taskAction) return tasks;
    return tasks.filter(t => t.action === taskAction);
  }

  get EnableVisuals(): boolean { return this.memory.enableVisuals ?? true; }
  set EnableVisuals(value: boolean) { this.memory.enableVisuals = value; }
  get EnableRepairOverlay(): boolean { return this.memory.enableRepairOverlay ?? false; }
  set EnableRepairOverlay(value: boolean) { this.memory.enableRepairOverlay = value; }
  get AttackHostiles(): boolean { return this.memory.attackHostiles ?? true; }
  set AttackHostiles(value: boolean) { this.memory.attackHostiles = value; }
  get DisableWarriors(): boolean { return this.memory.disableWarriors ?? false; }
  set DisableWarriors(value: boolean) { this.memory.disableWarriors = value; }
  get DisableTowers(): boolean { return this.memory.disableTowers ?? false; }
  set DisableTowers(value: boolean) { this.memory.disableTowers = value; }
  get DisableTowerAttacks(): boolean { return this.memory.disableTowerAttacks ?? false; }
  set DisableTowerAttacks(value: boolean) { this.memory.disableTowerAttacks = value; }
  get TowerAttackRange(): number { return this.memory.towerAttackRange ?? 20; }
  set TowerAttackRange(value: number) { this.memory.towerAttackRange = value; }
  get TowerCriticalSupplyRatio(): number { return this.memory.towerCriticalSupplyRatio ?? 0.75; }
  set TowerCriticalSupplyRatio(value: number) { this.memory.towerCriticalSupplyRatio = value; }
  get HostileNotificationThreshold(): number { return this.memory.hostileNotificationThreshold ?? 2; }
  set HostileNotificationThreshold(value: number) { this.memory.hostileNotificationThreshold = value; }
  get ClaimedNearbyRooms(): string[] { return this.memory.claimedNearby ?? []; }
  set ClaimedNearbyRooms(value: string[]) { this.memory.claimedNearby = unique([...this.memory.claimedNearby ?? [], ...value]); }
  get StorageWartimeEnergyBuffer(): number { return this.memory.storageWartimeEnergyBuffer ?? 5000; }
  get LinkGroups(): Dictionary<Id<StructureLink>[]> { return this.memory.linkGroups ?? {}; }
  set LinkGroups(value: Dictionary<Id<StructureLink>[]>) { this.memory.linkGroups = value; }

  set MinerPositions(value: MiningPosition[]) { this.memory.minerPositions = value; }

  private _MinerPositions: MiningPosition[] = [];
  get MinerPositions(): MiningPosition[] {
    if (this._MinerPositions.length > 0) return this._MinerPositions;

    // Create a RoomPosition on the way out for each minerPosition.
    this.memory.minerPositions ??= GetMinerPositions(this); // Memoize
    const ret: MiningPosition[] = [];
    for (const mp of this.memory.minerPositions)
      ret.push({
        sourceId: mp.sourceId,
        position: new RoomPosition(mp.position.x, mp.position.y, mp.position.roomName),
      });

    this._MinerPositions = ret;
    return this._MinerPositions;
  }

  private _RemoteMinerPositions: MiningPosition[] = [];
  get RemoteMinerPositions(): MiningPosition[] {
    if (this._RemoteMinerPositions.length > 0) return this._RemoteMinerPositions;
    var ret: MiningPosition[] = [];
    for (const claim of this.ClaimedNearbyRooms) {
      Memory.scoutingReports[claim].miningPositions ??= [];
      Memory.scoutingReports[claim].miningPositions.forEach(mp => ret.push({
        sourceId: mp.sourceId,
        position: new RoomPosition(mp.position.x, mp.position.y, mp.position.roomName),
      }));
    }
    this._RemoteMinerPositions = ret;
    return this._RemoteMinerPositions;
  }

  LastSpawnTick(roleName: string): number { return (this.memory.lastSpawnTick ?? {})[roleName] ?? 0; }

  SetLastSpawnTick(roleName: string, value: number): void {
    this.memory.lastSpawnTick ??= {};
    this.memory.lastSpawnTick[roleName] = value;
  };

  Quota(roleName: string) {
    // Return the custom quota from room memory if there is one.
    const overridenQuota = (this.memory.quotas ?? {})[roleName];
    if (overridenQuota !== undefined) return overridenQuota;

    // Try to get the role instance, and return -1 if we can't
    const role = this.colony.RoleRegistry.get(roleName);
    if (!role) {
      throw new Error(`Role is not in Registry: ${roleName}`);
    }

    // Return the quota from the role instance
    return role.GetRoomQuota(this);
  }

  get SpawnsOrExtensions(): (StructureExtension | StructureSpawn)[] {
    return this.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION
    });
  }

  get Hostiles(): Creep[] {
    return this.find(FIND_HOSTILE_CREEPS);
  }

  get ConstructionSites(): ConstructionSite[] {
    return this.find(FIND_MY_CONSTRUCTION_SITES);
  }

  get HostileInfo(): HostileInfo[] {
    return GetHostileInfo(this);
  }

  get AvailableSpawns(): StructureSpawn[] {
    return this.find(FIND_MY_SPAWNS, { filter: s => !s.spawning });
  }

  get Towers(): StructureTower[] {
    return this.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER });
  }

  get Sources(): Source[] {
    return this.find(FIND_SOURCES);
  }

  get Containers(): StructureContainer[] {
    return this.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER });
  }

  get Repairs(): AnyStructure[] {
    return this.find(FIND_STRUCTURES, { filter: s => s.hits < s.hitsMax });
  }

  get Ramparts(): StructureRampart[] {
    return this.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_RAMPART });
  }

  get Roads(): StructureRoad[] {
    return this.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_ROAD });
  }

  get LinkReceivers(): StructureLink[] {
    const ret = [];
    for (const id of this.LinkGroups.Receivers) {
      const obj = Game.getObjectById(id as Id<StructureLink>);
      if (!obj) continue;
      else ret.push(obj);
    }
    return ret;
  }

  get LinkSenders(): StructureLink[] {
    const ret = [];
    for (const id of this.LinkGroups.Senders) {
      const obj = Game.getObjectById(id as Id<StructureLink>);
      if (!obj) continue;
      else ret.push(obj);
    }
    return ret;
  }

  GetUnfilledMiningPositions(): MiningPosition[] {
    const ret = [];
    for (const mp of this.MinerPositions)
      if (new RoomPosition(mp.position.x, mp.position.y, mp.position.roomName).lookFor(LOOK_CREEPS).length === 0)
        ret.push(mp);
    return ret;
  }

  GetUnassignedMiningPositions(): MiningPosition[] {
    const assignedMiningPositions = this.colony.GetAllAssignedTasks(TaskAction.Mine).map(p => (p as Mine).target.position);
    const ret = [];
    for (const mp of this.MinerPositions)
      if (assignedMiningPositions.some(pos =>
        pos.x === mp.position.x
        && pos.y === mp.position.y
        && pos.roomName === mp.position.roomName
      )) continue;
      else ret.push(mp);
    return ret;
  }

  GetUnfilledUnassignedMiningPositions(): MiningPosition[] {
    const assignedMiningPositions = this.colony.GetAllAssignedTasks(TaskAction.Mine).map(p => (p as Mine).target.position);
    var ret: MiningPosition[] = [];
    for (const unfilled of this.GetUnfilledMiningPositions())
      if (assignedMiningPositions.some(pos =>
        pos.x === unfilled.position.x
        && pos.y === unfilled.position.y
        && pos.roomName === unfilled.position.roomName
      )) continue;
      else ret = ret.concat(unfilled);
    return ret;
  }

  GetUnassignedRemoteMiningPositions(): MiningPosition[] {
    const assignedMiningPositions = this.colony.GetAllAssignedTasks(TaskAction.Mine).map(p => (p as Mine).target.position);

    var ret: MiningPosition[] = [];
    for (const claim of this.ClaimedNearbyRooms) {
      Memory.scoutingReports[claim].miningPositions ??= [];
      const remoteMiningPositions: MiningPosition[] = Memory.scoutingReports[claim].miningPositions.map(mp => ({
        sourceId: mp.sourceId,
        position: new RoomPosition(mp.position.x, mp.position.y, mp.position.roomName),
      }));

      for (const rmp of remoteMiningPositions)
        if (assignedMiningPositions.some(pos =>
          pos.x === rmp.position.x
          && pos.y === rmp.position.y
          && pos.roomName === rmp.position.roomName
        )) continue;
        else ret.push(rmp);
    }

    return ret;
  }

  GetVisibleUncontestedClaimedRooms(): Room[] {
    const ret = [];
    for (const name of this.ClaimedNearbyRooms)
      // A room is claimed by us if it is both visible, and not owned by someone else
      if (name in Game.rooms && (Game.rooms[name].controller == undefined || Game.rooms[name].controller?.owner == undefined))
        ret.push(Game.rooms[name]);
    return ret;
  }

  CleanupDeadCreeps(): void {
    for (const name in Memory.creeps) {
      // If the creep is dead and was assigned to this room
      if (!(name in Game.creeps) && Memory.creeps[name].room === this.name) {
        this.log.info(`Generic Cleanup memory for ${name}`);
        const oldMem = Memory.creeps[name];
        delete Memory.creeps[name];

        // Invoke the role cleanup if they had a role
        const role = this.colony.RoleRegistry.get(oldMem.role);
        if (role) role.OnCleanup(this, name, oldMem);
      }
    }
  }

  // Remove rooms from the claim list if they are not ok to claim
  ValidateClaimedRooms(): void {
    const stillValid: string[] = [];
    for (const roomName of this.ClaimedNearbyRooms) {
      // Assume invisible rooms are still ok to claim
      if (!(roomName in Game.rooms)) {
        stillValid.push(roomName);
        continue;
      }

      // If the room is neutral, it's still ok to claim
      const room = Game.rooms[roomName];
      if (room && (room.controller == undefined || room.controller.owner == undefined)) {
        stillValid.push(roomName);
        continue;
      }
    }

    this.ClaimedNearbyRooms = stillValid;
  }

  Tick(): void {
    // Cleanup Dead creeps
    this.CleanupDeadCreeps();

    // Remove claims that are no longer neutral
    this.ValidateClaimedRooms();

    // Report hostiles
    this.ReportHostiles();

    // Send energy across links
    for (const sender of this.LinkSenders)
      for (const receiver of this.LinkReceivers)
        this.SendLink(sender, receiver);

    // Run each tower in the room
    if (!this.DisableTowers)
      for (const tower of this.Towers)
        this.TickTower(tower);

    // Build any designated roads
    this.BuildRoads();

    // Visuals
    if (this.EnableVisuals && this.EnableRepairOverlay)
      this.DrawRepairOverlay();
  }

  SendLink(sender: StructureLink, receiver: StructureLink): void {
    if (!sender.isActive() || !receiver.isActive()) return; // Can't use links
    if (sender.store.getUsedCapacity() === 0 || sender.cooldown > 0) return; // Nothing to send
    if (receiver.store.getFreeCapacity() === 0) return; // No ability to receive
    const ret = sender.transferEnergy(receiver);
    if (ret !== OK) this.log.warn(`Link Transfer from ${sender} -> ${receiver} failed: ${ret}`);
  }

  ReportHostiles(): void {
    if (this.HostileInfo.length >= this.HostileNotificationThreshold && Game.time % 10 === 0) {
      var msg = `!!! Hostiles Spotted in ${this.name}:\n`;
      msg += `\t${FormatHostileInfos(this.HostileInfo)}`;
    }
  }

  CheckSpawns(): void {
    const maxSpawns = this.AvailableSpawns.length;
    if (maxSpawns === 0) {
      this.log.debug(`Room has no available spawn points.`);
      return;
    }

    var completedSpawns = 0;

    for (const r of this.colony.RoleRegistry.values()) {
      this.log.debug(`Checking Spawns for ${r.name}`);
      if (!this.IsRoleSpawnable(r)) continue;
      if (!r.IsSpawnNeeded(this)) continue;

      const name = `${r.GetNewCreepName(this)}, ${r.name}`;
      const spawnSuccessful = r.AttemptSpawn(this, r.GetNewCreepBody(this), r.GetInitialTask(this), name);
      if (!spawnSuccessful) continue;

      this.SetLastSpawnTick(r.name, Game.time);
      r.OnSpawnScheduled(this, name);

      // If we used up all the spawn points, then return early.
      if (++completedSpawns >= maxSpawns) return;
    }
  }

  IsRoleSpawnable(role: CreepRole): boolean {
    const globalQuota = role.GetGlobalQuota();
    if (globalQuota >= 0) {
      const globalCount = role.GetGlobalCreepsInRole().length;
      if (globalQuota === 0 || (globalQuota !== -1 && globalCount >= globalQuota)) {
        this.log.debug(`Global quota satisfied: ${globalCount}/${globalQuota}`, { "<role>": role });
        return false;
      } else {
        this.log.debug(`Global quota allows spawn: ${globalCount}/${globalQuota}`, { "<role>": role });
      }
    } else {
      this.log.debug(`Global quota not configured.`, { "<role>": role });
    }

    const roomQuota = this.Quota(role.name);
    if (roomQuota >= 0) {
      const roomCount = role.GetRoomCreepsInRole(this).length;
      if (roomQuota === 0 || (roomQuota !== -1 && roomCount >= roomQuota)) {
        this.log.debug(`Room quota satisfied: ${roomCount}/${roomQuota}`, { "<role>": role });
        return false;
      } else {
        this.log.debug(`Room quota allows spawn: ${roomCount}/${roomQuota}`, { "<role>": role });
      }
    } else {
      this.log.debug(`Room quota not configured.`, { "<role>": role });
    }

    return true;
  }

  RoomStateReport(): string {
    let msg = "";
    let totalRoles = 0;
    let spawned = 0;

    // Build a string of role populations
    for (const name of Array.from(this.colony.RoleRegistry.keys()).sort()) {
      totalRoles++;
      const role = this.colony.RoleRegistry.get(name);
      if (!role) {
        this.log.crit(`No instance for ${name}`);
        continue;
      }

      const spawnNeeded = role.IsSpawnNeeded(this);
      const spawnAble = this.IsRoleSpawnable(role);
      const spawnableStr = spawnAble ? '+' : '';
      const spawnNeededStr = spawnNeeded ? '*' : '';
      const roomQuota = this.Quota(name);
      const globalQuota = role.GetGlobalQuota();
      const roomCount = role.GetRoomCreepsInRole(this).length;
      const globalCount = role.GetGlobalCreepsInRole().length;
      const globalCountStr = globalQuota > -1 && (globalCount !== roomCount || roomQuota === -1) ? ` | ${globalCount}/${globalQuota}` : "";

      if (spawnNeeded || spawnAble || roomCount > 0) {
        msg += ` [${name}${spawnNeededStr}${spawnableStr} ${roomCount}/${roomQuota}${globalCountStr}]`;
        spawned++;
      }
    }

    const ownedStatus = this.parent != undefined ? `Claimed by ${this.parent.name}` : `HQ`;

    // Prepend a leader to the populations string.
    msg = `${this.name} (${ownedStatus}) ::: ${spawned}/${totalRoles} Roles, ${this.AssignedCreeps.length} Assigned Creeps` + msg;

    if (this.storage) {
      const ratio = 100 * (this.storage.store.getUsedCapacity(RESOURCE_ENERGY) / this.storage.store.getCapacity(RESOURCE_ENERGY));
      msg += ` ENERGY IN STORAGE: ${ratio} (${this.storage.store.getUsedCapacity(RESOURCE_ENERGY)}/${this.storage.store.getCapacity(RESOURCE_ENERGY)})`;
    }

    if (this.controller) {
      const nextLevelStr = this.controller.level === 8 ? "" : ` -> ${this.controller.level + 1}`;
      const downgradeMaintenanceThreshold = CONTROLLER_DOWNGRADE[this.controller.level] * UpdateController.DowngradeMaintenanceRatio;
      const downgradeStr = this.controller.ticksToDowngrade < downgradeMaintenanceThreshold ? ` , Downgrade in ${this.controller.ticksToDowngrade}` : "";
      msg += ` CONTROLLER ${this.controller.level}${nextLevelStr} ${FmtRatios(this.controller.progress, this.controller.progressTotal, true, [], 3, "K", 1000)}${downgradeStr}`;
    }

    // Append hostile details
    if (this.HostileInfo.length) {
      msg += `\nHOSTILES ${this.HostileInfo.length} :::\n`;
      msg += `\t${FormatHostileInfos(this.HostileInfo)}`;
    }

    // Get info about claimed rooms
    const claimed = this.GetVisibleUncontestedClaimedRooms();
    if (claimed.length)
      for (const claim of claimed) msg += `\n\t${claim}`;

    return msg;
  }

  DrawRepairOverlay(): void {
    for (const d of this.Repairs)
      this.visual.rect(d.pos.x - 0.5, d.pos.y - 0.5, 1, 1, { fill: LerpColour("#ff0000", "#00ff00", d.hits / d.hitsMax) });
  };

  // List of filter callback, health capacity to begin repair, and maxRepairers, descending order.
  RepairPriorities: [((s: AnyStructure) => boolean), number, number][] = [
    [(s => s instanceof StructureContainer || s instanceof StructurePortal), 0.9, 2],
    [(s => !(s instanceof StructureContainer || s instanceof StructurePortal || s instanceof StructureRoad || s instanceof StructureWall || s instanceof StructureRampart) && s.my), 0.9, 2],
    [(s => s instanceof StructureRoad), 0.75, 1],
    [(s => s instanceof StructureRampart), 1, 1],
    [(s => s instanceof StructureWall), 0.1, 1],
    [(_ => true), 0.75, 1],
  ];

  FindRepairByPriorityAndStrength(pos: RoomPosition): AnyStructure | null {
    let priorityIndex = 0;
    for (const [p, repairAt, _] of this.RepairPriorities) {
      // Get candidates and group by number of suppliers
      const needsRepair = this.Repairs
        .filter(s => p(s) && (s.hits / s.hitsMax) < repairAt)
        .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax))
        .pop();

      if (needsRepair) return needsRepair;
      priorityIndex++;
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
      this.visual.circle(tower.pos, { radius: this.TowerAttackRange, stroke: Colours.ATTACK_RANGE, opacity: 0.1, strokeWidth: 0.5 });

      // Find lowest health hostile in range
      const weakestHostile = tower.pos
        .findInRange(this.Hostiles, this.TowerAttackRange)
        .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax))
        .pop();
      if (weakestHostile) {
        const res = tower.attack(weakestHostile);
        this.log.debug(`!!! Tower Attacked ${weakestHostile.name} from ${weakestHostile.owner.username} (${weakestHostile.hits}/${weakestHostile.hits}) with result ${res}!`);
        return;
      }
    }

    // My creeps in need of healing, weakest first
    const weakestFriendly = this.colony.MyCreeps
      .filter(c => c.hits < c.hitsMax)
      .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax))
      .pop();
    if (weakestFriendly) {
      const res = tower.heal(weakestFriendly);
      this.log.debug(`Tower Healed ${weakestFriendly.name} (${weakestFriendly.hits}/${weakestFriendly.hitsMax}) with result ${res}!`);
      return;
    }

    // If we have enough energy, repair the most damaged structure in the room
    if (supplyRatio >= this.TowerCriticalSupplyRatio) {
      const needRepair = this.FindRepairByPriorityAndStrength(tower.pos);
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
