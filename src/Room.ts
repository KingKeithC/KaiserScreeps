import { CreepExtra } from "Creep";
import { Colours } from "Data";
import type { Colony } from "Colony";
import { countGraphemes } from 'unicode-segmenter/grapheme';
import { LerpColour } from "utils/Collections";
import { Logger } from "utils/Logger";
import { CreepTask } from "Tasks";

declare global {
  interface RoomMemory {
    lastSeen?: number;
    lastSpawnTick: { [roleName: string]: number; };
    quotas?: { [roleName: string]: number; };
    enableVisuals?: boolean,
    enableRepairOverlay?: boolean,
    attackHostiles: boolean,
    disableWarriors: boolean,
    disableTowers: boolean,
    disableTowerAttacks: boolean,
    towerAttackRange: number,
    disableEvents?: boolean,
    eventReportingFrequencyTicks?: number;
    maxEventLogPerRoom?: number;
    towerAttackRangeTiles?: number;
    towerCriticalSupplyRatio?: number;
    notificationFrequency?: number;
    hostileNotificationThreshold?: number;
  }
}

interface EventSummary {
  time: number,
  event: string,
  summary: string,
  value: number | null,
}


interface HostileInfo {
  owner: string;
  name: string;
  bodyCost: number;
  partCounts: { [part: string]: number; };
}

export class RoomExtra extends Room {
  readonly colony: Colony;
  readonly log: Logger<RoomExtra> = new Logger(this, { formatArgs: { "<room>": this } });
  readonly AssignedCreeps: CreepExtra[];
  readonly AssignedCreepsByRoleName: Map<string, CreepExtra[]>;
  readonly AssignedCreepsByRoleGroup: Map<string, CreepExtra[]>;

  constructor(room: Room, colony: Colony) {
    super(room.name);
    this.colony = colony;
    this.controller = room.controller;
    this.storage = room.storage;
    this.terminal = room.terminal;
    this.energyAvailable = room.energyAvailable;
    this.energyCapacityAvailable = room.energyCapacityAvailable;

    this.AssignedCreeps = colony.MyCreeps.filter(c => c.memory.room === this.name);
    this.AssignedCreepsByRoleName = new Map();
    this.AssignedCreepsByRoleGroup = new Map();
    for (const c of this.AssignedCreeps) {
      if (!c.role) continue;
      this.AssignedCreepsByRoleName.set(c.role.name, [...this.AssignedCreepsByRoleName.get(c.role.name) ?? [], c]);
      this.AssignedCreepsByRoleGroup.set(c.role.groupName, [...this.AssignedCreepsByRoleGroup.get(c.role.groupName) ?? [], c]);
    }
  }

  GetAssignedTasks(): CreepTask[] {
    return this.AssignedCreeps.map(c => c.memory.jobMemory as CreepTask);
  }

  get LastSeen(): number { return this.memory.lastSeen ?? 0; }
  set LastSeen(value: number) { this.memory.lastSeen = value; }
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
  get DisableEvents(): boolean { return this.memory.disableEvents ?? false; }
  set DisableEvents(value: boolean) { this.memory.disableEvents = value; }
  get EventReportingFrequencyTicks(): number { return this.memory.eventReportingFrequencyTicks ?? 500; }
  set EventReportingFrequencyTicks(value: number) { this.memory.eventReportingFrequencyTicks = value; }
  get MaxEventLogPerRoom(): number { return this.memory.maxEventLogPerRoom ?? 1500; }
  set MaxEventLogPerRoom(value: number) { this.memory.maxEventLogPerRoom = value; }
  get NotificationFrequency(): number { return this.memory.notificationFrequency ?? 100; }
  set NotificationFrequency(value: number) { this.memory.notificationFrequency = value; }
  get HostileNotificationThreshold(): number { return this.memory.hostileNotificationThreshold ?? 4; }
  set HostileNotificationThreshold(value: number) { this.memory.hostileNotificationThreshold = value; }

  LastSpawnTick(roleName: string): number { return (this.memory.lastSpawnTick ?? {})[roleName] ?? 0; }

  SetLastSpawnTick(roleName: string, value: number): void {
    this.memory.lastSpawnTick ??= {};
    this.memory.lastSpawnTick[roleName] = value;
  }

  Quota(roleName: string) {
    // Return the custom quota from room memory if there is one.
    const overridenQuota = (this.memory.quotas ?? {})[roleName];
    if (overridenQuota !== undefined) return overridenQuota;

    // Try to get the role instance, and return -1 if we can't
    const role = this.colony.RoleRegistry.get(roleName);
    if (!role) return 0; // Disabled if we can't find the role.

    // Return the quota from the role instance
    return role.GetRoomQuota(this);
  }

  // Search the spaces around each source, and return
  // the number of free spaces which a Miner creep could fill.
  GetMinerPositions(): RoomPosition[] {
    const sources = this.Sources;
    const terrain = this.getTerrain();
    let spaces = 0;
    const possibleMiners = [];

    for (const s of sources)
      // Given the source.pos is the centre point
      // get the positions of all the surrounding spaces
      for (let x = s.pos.x - 1; x <= s.pos.x + 1; x++)
        for (let y = s.pos.y - 1; y <= s.pos.y + 1; y++) {
          if (x === s.pos.x && y === s.pos.y) continue; // Skip centre point
          if (terrain.get(x, y) === 0) {
            const pos = this.getPositionAt(x, y);
            if (!pos) { this.log.debug(`getPositionAt Possible Miner position ${x} ${y} in ${this.name} is null`); continue; }
            possibleMiners.push(pos);
          }
          spaces++;
          // this.room.visual.rect(x, y, 1, 1, { fill: Colours.ATTACK_RANGE });
        }

    this.log.debug(`Searched ${spaces} spaces and found ${possibleMiners} possible positions for miners.`);
    return possibleMiners;
  }

  get SpawnsOrExtensions(): (StructureExtension | StructureSpawn)[] {
    return this.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION
    });
  }

  get Hostiles(): Creep[] {
    return this.find(FIND_HOSTILE_CREEPS);
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

  Tick(): void {
    // Run each tower in the room
    if (!this.DisableTowers)
      for (const tower of this.Towers)
        this.TickTower(tower);

    // Periodically print a status report about the room
    if (Game.time % this.NotificationFrequency === 0)
      this.RoomStateReport();

    // Build any designated roads
    this.BuildRoads();

    // Visuals
    if (this.EnableVisuals && this.EnableRepairOverlay)
      this.DrawRepairOverlay();

    // Check Spawns
    this.CheckSpawns();
  }

  CheckSpawns(): void {
    for (const r of this.colony.RoleRegistry.values()) {
      this.log.debug(`Checking Spawns for ${r.name}`);
      if (!r.IsEnabledFor(this)) continue;
      if (!r.IsSpawnNeeded(this)) continue;
      if (!r.AttemptSpawn(this, r.GetNewCreepBody(this))) continue;

      // Spawn was successful
      this.SetLastSpawnTick(r.name, Game.time);
      return;
    }
  }

  // TickAllUnOwnedRoom(): void {
  //   const timeSinceLastSeen = Game.time - this.LastSeen;
  //   if (timeSinceLastSeen === Game.time) this.log.warn(`[${this.room}]: this is a brand new room to us!`);
  //   else if (timeSinceLastSeen > 50) this.log.warn(`[${this.room}]: We haven't seen this room in ${timeSinceLastSeen} ticks...`);
  //   else if (Game.time % this.NotificationFrequency === 0) this.log.warn(`[${this.room}]: Not owned: ${this.Status}.`);
  // }

  RoomStateReport(): void {
    let msg = "";
    let totalRoles = 0;
    let enabledRoles = 0;

    // Build a string of role populations
    for (const name of Array.from(this.colony.RoleRegistry.keys()).sort()) {
      totalRoles++;
      const inst = this.colony.RoleRegistry.get(name);
      if (!inst) {
        this.log.crit(`No instance for ${name}`);
        continue;
      }
      const roomQuota = this.Quota(name);
      const globalQuota = inst.GetGlobalQuota();
      const roomCount = inst.GetRoomCreepsInRole(this).length;

      // Skip roles that are disabled, unless there are some creeps spawned in that role
      if (roomCount === 0 && (globalQuota === 0 || roomQuota === 0)) continue;
      const globalCount = inst.GetGlobalCreepsInRole().length;
      const globalCountStr = ` | ${globalCount}/${globalQuota}`;
      msg += ` [${name} ${roomCount}/${roomQuota}${globalCount !== roomCount ? globalCountStr : ""}]`;
      enabledRoles++;
    }
    // Prepend a leader to the populations string.
    msg = `T${Game.time} ROOM ${this.name} REPORT ::: ${enabledRoles} Roles (${totalRoles - enabledRoles} disabled) ${this.AssignedCreeps.length} Assigned Creeps` + msg;

    // Get info about hostiles
    const hostileInfo = this.Hostiles.map(c => ({
      owner: c.owner.username,
      name: c.name,
      bodyCost: CreepExtra.BodyCost(c.body.map(p => p.type)),
      partCounts: c.body.reduce((counts, part) => {
        counts[part.type] = (counts[part.type] ?? 0) + 1;
        return counts;
      }, {} as Record<string, number>),
    }));

    // Append hostile details
    if (hostileInfo.length) {
      msg += `\nHOSTILES ${hostileInfo.length} :::`;
      for (const h of hostileInfo) msg += `\n\t` + JSON.stringify(h);
    }

    // Print
    this.log.report(msg);
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
    [(s => s instanceof StructureWall || s instanceof StructureRampart), 0.9, 1],
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
        this.log.debug(`!!! Tower Attacked ${weakestHostile.name} from $${weakestHostile.owner.username} (${weakestHostile.hits}/${weakestHostile.hits}) with result ${res}!`);
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
