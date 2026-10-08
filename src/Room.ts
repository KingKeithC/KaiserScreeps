import { CreepExtra } from "Creep";
import { Colours } from "Data";
import { sortBy, sum } from "lodash";
import { RoomRole } from "roles/Role";
import { countGraphemes } from 'unicode-segmenter/grapheme';
import { LerpColour } from "utils/Collections";

export enum RoomControlStatus {
  Owned,
  Claimed,
  Neutral,
  Hostile,
  Unknown,
}

declare global {
  interface RoomMemory {
    status: RoomControlStatus,
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
    recentEvents: EventSummary[],
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

export class RoomExtra {
  static StatusOf(room: Room): RoomControlStatus {
    if (room.controller?.my)
      return RoomControlStatus.Owned;

    if (room.controller == undefined)
      return RoomControlStatus.Neutral;

    if ("Claimed" in room.find(FIND_FLAGS).keys())
      return RoomControlStatus.Claimed;

    // Assume hostile by default
    return RoomControlStatus.Hostile;
  }


  readonly room: Room;
  constructor(room: Room) {
    this.room = room;
  }

  get LastSeen(): number { return this.room.memory.lastSeen ?? 0; }
  get Status(): RoomControlStatus { return this.room.memory.status ?? RoomExtra.StatusOf(this.room); }
  get EnableVisuals(): boolean { return this.room.memory.enableVisuals ?? true; }
  get EnableRepairOverlay(): boolean { return this.room.memory.enableRepairOverlay ?? false; }
  get AttackHostiles(): boolean { return this.room.memory.attackHostiles ?? true; }
  get DisableWarriors(): boolean { return this.room.memory.disableWarriors ?? false; }
  get DisableTowers(): boolean { return this.room.memory.disableTowers ?? false; }
  get DisableTowerAttacks(): boolean { return this.room.memory.disableTowerAttacks ?? false; }
  get TowerAttackRange(): number { return this.room.memory.towerAttackRange ?? 20; }
  get TowerCriticalSupplyRatio(): number { return this.room.memory.towerCriticalSupplyRatio ?? 0.75; }
  get DisableEvents(): boolean { return this.room.memory.disableEvents ?? false; }
  get RecentEvents(): EventSummary[] { return this.room.memory.recentEvents ?? []; }
  get EventReportingFrequencyTicks(): number { return this.room.memory.eventReportingFrequencyTicks ?? 500; }
  get MaxEventLogPerRoom(): number { return this.room.memory.maxEventLogPerRoom ?? 1500; }
  get NotificationFrequency(): number { return this.room.memory.notificationFrequency ?? 10; }
  get HostileNotificationThreshold(): number { return this.room.memory.hostileNotificationThreshold ?? 4; }

  LastSpawnTick(roleName: string): number { return (this.room.memory.lastSpawnTick ?? {})[roleName] ?? 0; }
  Quota(roleName: string) { return (this.room.memory.quotas ?? {})[roleName] ?? -1; }

  // Search the spaces around each source, and return
  // the number of free spaces which a Miner creep could fill.
  GetMinerPositions(): RoomPosition[] {
    const sources = this.room.find(FIND_SOURCES);
    const terrain = this.room.getTerrain();
    var spaces = 0;
    var possibleMiners = [];

    for (const s of sources)
      // Given the source.pos is the centre point
      // get the positions of all the surrounding spaces
      for (var x = s.pos.x - 1; x <= s.pos.x + 1; x++)
        for (var y = s.pos.y - 1; y <= s.pos.y + 1; y++) {
          if (x === s.pos.x && y === s.pos.y) continue; // Skip centre point
          if (terrain.get(x, y) === 0) {
            const pos = this.room.getPositionAt(x, y);
            if (!pos) { console.log(`getPositionAt Possible Miner position ${x} ${y} in ${this.room.name} is null`); continue; }
            possibleMiners.push(pos);
          }
          spaces++;
          // this.room.visual.rect(x, y, 1, 1, { fill: Colours.ATTACK_RANGE });
        }

    // console.log(`Searched ${spaces} spaces and found ${possibleMiners} possible positions for miners.`);
    return possibleMiners;
  }

  get SpawnsOrExtensions() {
    return this.room.find(FIND_MY_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION
    }) as AnyStoreStructure[];
  }

  private _AssignedCreeps: CreepExtra[] = [];
  get AssignedCreeps(): CreepExtra[] {
    // Return cached
    if (this._AssignedCreeps.length) return this._AssignedCreeps;

    // Iterate, filter, and map the creeps assigned to the room to
    // our extension class.
    this._AssignedCreeps = Object.values(Game.creeps)
      .filter(c => c.my && !c.spawning && c.memory.room === this.room.name)
      .map(c => new CreepExtra(c.id));

    return this._AssignedCreeps;
  }

  // Group creeps assigned to this room into lists by role
  get AssignedCreepsByRole(): Map<string, CreepExtra[]> {
    const map = new Map();
    for (const c of this.AssignedCreeps)
      if (RoomRole.Registry.has(c.memory.role)) {
        const creeps = map.get(c.memory.role) ?? [];
        creeps.push(c);
        map.set(c.memory.role, creeps);
      } else {
        console.log(`[${this.room}]${c}: Is assigned to unknown role: ${c.memory.role}`);
      }
    return map;
  }

  get Towers(): StructureTower[] {
    return this.room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER });
  }

  private _RoleInstances: Map<string, RoomRole<any>> = new Map();
  get RoleInstances(): Map<string, RoomRole<any>> {
    if (this._RoleInstances.values.length) return this._RoleInstances;

    var offset = 0;
    for (const roleType of RoomRole.Registry.values()) {
      const role = new roleType(this); // Construct a role instance for the room
      role.SpawnTickOffet = offset;
      offset += 10; // Spawn each role about 10 ticks apart
      this._RoleInstances.set(role.RoleName, role);
    }

    return this._RoleInstances;
  }

  OnTick() {
    // Dispatch to tick function based on room type.

    if (this.Status === RoomControlStatus.Owned) {
      // If owned, handle it and return early
      this.TickOwnedRoom();
      return;
    }

    this.TickAllUnOwnedRoom();

    switch (this.Status) {
      case RoomControlStatus.Claimed: this.TickClaimedRoom(); break;
      case RoomControlStatus.Hostile: this.TickHostileRoom(); break;
      case RoomControlStatus.Neutral: this.TickNeutralRoom(); break;
      case RoomControlStatus.Unknown: this.TickUnknownRoom(); break;
      default: console.log(`${this.room.name} has invalid Status: ${this.Status}`); break;
    }

    // Update Status, and Last seen on unowned rooms
    this.room.memory.lastSeen = Game.time;
    this.room.memory.status = RoomExtra.StatusOf(this.room);
  }

  TickOwnedRoom(): void {
    // Handle events
    if (!this.DisableEvents) {
      this.ProcessEventsLastTick();

      if (Game.time % this.EventReportingFrequencyTicks === 0)
        this.PrintEventSummary();
    }

    // Run each tower in the room
    if (!this.DisableTowers)
      for (const tower of this.Towers)
        this.TickTower(tower as StructureTower);

    // Run all our creeps/roles assigned to the room
    for (const role of this.RoleInstances.values())
      role.TickRole();

    // Periodically print a status report about the room
    if (Game.time % this.NotificationFrequency === 0)
      this.RoomStateReport();


    // Build any designated roads
    this.BuildRoads();

    // Visuals
    if (this.EnableVisuals && this.EnableRepairOverlay)
      this.DrawRepairOverlay();
  }

  TickAllUnOwnedRoom(): void {
    const timeSinceLastSeen = Game.time - this.LastSeen;
    if (timeSinceLastSeen === Game.time) console.log(`[${this.room}]: this is a brand new room to us!`);
    else if (timeSinceLastSeen > 50) console.log(`[${this.room}]: We haven't seen this room in ${timeSinceLastSeen} ticks...`);
    else if (Game.time % this.NotificationFrequency === 0) console.log(`[${this.room}]: Not owned: ${this.Status}.`);
  }

  TickUnknownRoom() { }
  TickNeutralRoom() { }
  TickHostileRoom() { }
  TickClaimedRoom() { }

  RoomStateReport(): void {
    var msg = `T${Game.time} ROOM ${this.room.name} REPORT ::: ${this.RoleInstances.size} Roles ${this.AssignedCreeps.length} Total Creeps`;
    for (const name of Array.from(this.RoleInstances.keys()).sort()) {
      const inst = this.RoleInstances.get(name);
      if (!inst) {
        console.log(`No instance for ${name}`);
        continue;
      }
      const roomCount = `${inst.CreepsInRoomAndRole.length}/${inst.CountPerRoom}`;
      const globalCount = ` | ${inst.CreepsInRole.length}/${inst.GlobalCount}`;
      msg += ` [${name} ${roomCount}${inst.GlobalCount < 0 ? "" : globalCount}]`;
    }

    const hostiles = this.room.find(FIND_HOSTILE_CREEPS).map(c => ({
      owner: c.owner.username,
      name: c.name,
      bodyCost: CreepExtra.BodyCost(c.body.map(p => p.type)),
      partCounts: c.body.reduce((counts, part) => {
        counts[part.type] = (counts[part.type] ?? 0) + 1;
        return counts;
      }, {} as Record<string, number>),
    }));

    if (hostiles.length) {
      msg += `\nHOSTILES ${hostiles.length} :::`;
      for (const h of hostiles) msg += `\n\t` + JSON.stringify(h);
    }

    msg += "\nGLOBAL RESOURCES :::";
    for (const name of Array.from(Object.keys(Game.resources)).sort())
      msg += ` [${name}: ${Game.resources[name]}]`;

    console.log(msg);
  }

  DrawRepairOverlay(): void {
    const damaged = this.room.find(FIND_STRUCTURES, { filter: s => s.hits < s.hitsMax });
    for (const d of damaged)
      this.room.visual.rect(d.pos.x - 0.5, d.pos.y - 0.5, 1, 1, { fill: LerpColour("#ff0000", "#00ff00", d.hits / d.hitsMax) });
  }

  PrintEventSummary() {
    const end = Game.time;
    const start = end - this.EventReportingFrequencyTicks;
    const summaryByEvent = new Map<string, [number, number | null]>();
    const extraPadding = 2;
    var grandTotalEventCount = 0;
    var headers = ["Event Name", "Count", "Sum of Amount"];
    var widths = [10, 6, 8];
    var summary = "";

    // Iterate the events to summarize them
    for (const e of this.room.memory.recentEvents) {
      grandTotalEventCount++;

      // Get current & calculate new group entries
      const [count, totalAmount] = summaryByEvent.get(e.event) ?? [0, null];
      const newCount = count + 1;
      const newTotal = e.value ? (totalAmount ?? 0) + e.value : null;

      // Update column padding if string of any entry is longer than the default
      if (countGraphemes(e.event) > widths[0]) widths[0] = countGraphemes(e.event);
      if (newCount.toString().length > widths[1]) widths[1] = newCount.toString().length;
      if (newTotal && newTotal.toString().length > widths[2]) widths[2] = newTotal.toString().length;

      // Update the group
      summaryByEvent.set(e.event, [newCount, newTotal]);
    }

    // Get the keys of the group in sorted order
    const printorder = Array.from(summaryByEvent.keys()).sort();

    widths = widths.map(w => w + extraPadding);

    // Construct the actual message
    summary += `============= ${this.room.name} EVENT SUMMARY FROM ${start} to ${end} (~${this.EventReportingFrequencyTicks} Ticks) =============`;
    summary += `\n   ${headers[0].padEnd(widths[0])} ${headers[1].padStart(widths[1])} ${headers[2].padStart(widths[2])}`;
    summary += `\n   ${"-".repeat(headers[0].length).padEnd(widths[0])} ${"-".repeat(headers[1].length).padStart(widths[1])} ${"-".repeat(headers[2].length).padStart(widths[2])}`;
    for (const c of printorder) {
      const [count, amount] = summaryByEvent.get(c) ?? [-1, null];
      summary += `\n - ${c.padEnd(widths[0])}: ${count.toString().padStart(widths[1])} ${amount ? amount?.toString().padStart(widths[2]) : "<>".padStart(widths[2])}`;
    }
    summary += `\n================================= ${grandTotalEventCount.toString().padStart(5)} TOTAL EVENTS ==================================`;

    // Print it
    console.log(summary);
    // Game.notify(summary, 60 * 6);

    // Wipe the event log
    this.room.memory.recentEvents = [];
  }

  EventItemToSummary(item: EventItem): string {
    switch (item.event) {
      case EVENT_ATTACK:
        return `Attack: ${item.data.attackType} -> ${item.data.targetId} for ${item.data.damage}`;
      case EVENT_HARVEST:
        return `Harvest: ${item.data.amount} from ${item.data.targetId}`;
      case EVENT_BUILD:
        return `${item.data.incomplete ? "Building" : "Completed"}: ${item.data.structureType} at (x:${item.data.x}, y:${item.data.y})${item.data.incomplete ? ` for ${item.data.amount}` : ""}`;
      default:
        return `todo`;
    }
  }

  ProcessEventsLastTick() {
    // Get events from last tick
    const events = this.room.getEventLog();
    const newEvents = events.map((e => ({
      time: Game.time - 1,
      event: this.EventConstantToName(e.event),
      summary: this.EventItemToSummary(e),
      value: this.EventDataToValue(e),
    })));

    // Take the last `this.MaxEventLogPerRoom` and assign to
    // recentEvents room memory.
    this.room.memory.recentEvents = this.RecentEvents.concat(newEvents).slice(-this.MaxEventLogPerRoom);

    const myCreepsIdsInRoom = this.AssignedCreeps.map(c => c.id);
    const newAttacksOnMyCreeps = events
      .filter(e => e.event === EVENT_ATTACK && myCreepsIdsInRoom.includes(e.data.targetId as Id<CreepExtra>))
      .map(a => ({
        time: Game.time - 1,
        victim: (a as { data: { targetId: string; }; }).data.targetId,
      }));
    if (newAttacksOnMyCreeps.length > 0) {
      console.log(`ATTACKS PERFORMED IN [${this.room}] AGAINST MY CREEPS: `);
      for (const att of newAttacksOnMyCreeps)
        console.log(JSON.stringify(att));
    }
  }

  EventConstantToName(event: EventConstant): string {
    switch (event) {
      case EVENT_ATTACK: return "Attack";
      case EVENT_OBJECT_DESTROYED: return "Destroyed";
      case EVENT_ATTACK_CONTROLLER: return "Attack Controller";
      case EVENT_BUILD: return "Build";
      case EVENT_HARVEST: return "Harvest";
      case EVENT_HEAL: return "Heal";
      case EVENT_REPAIR: return "Repair";
      case EVENT_RESERVE_CONTROLLER: return "Reserve";
      case EVENT_UPGRADE_CONTROLLER: return "Upgrade";
      case EVENT_EXIT: return "Exit";
      case EVENT_POWER: return "Power";
      case EVENT_TRANSFER: return "Transfer";
    }
  }

  EventDataToValue(event: EventItem): number | null {
    switch (event.event) {
      case EVENT_ATTACK: return event.data.damage;
      case EVENT_OBJECT_DESTROYED: return null;
      case EVENT_ATTACK_CONTROLLER: return event.data;
      case EVENT_BUILD: return event.data.amount;
      case EVENT_HARVEST: return event.data.amount;
      case EVENT_HEAL: return event.data.amount;
      case EVENT_REPAIR: return event.data.amount;
      case EVENT_RESERVE_CONTROLLER: return event.data.amount;
      case EVENT_UPGRADE_CONTROLLER: return event.data.amount;
      case EVENT_EXIT: return null;
      case EVENT_POWER: return null;
      case EVENT_TRANSFER: return event.data.amount;
    }
  }

  // List of filter callback, health capacity to begin repair, and maxRepairers, descending order.
  RepairPriorities: [((s: AnyStructure) => boolean), number, number][] = [
    [(s => s instanceof StructureWall || s instanceof StructureRampart), 0.01, 2],
    [(s => s instanceof StructureContainer || s instanceof StructurePortal), 0.9, 2],
    [(s => !(s instanceof StructureContainer || s instanceof StructurePortal || s instanceof StructureRoad || s instanceof StructureWall || s instanceof StructureRampart) && s.my), 0.9, 2],
    [(s => s instanceof StructureRoad), 0.75, 1],
    [(s => s instanceof StructureWall || s instanceof StructureRampart), 0.9, 1],
    [(_ => true), 0.75, 1],
  ];

  FindRepairByPriorityAndStrength(pos: RoomPosition): AnyStructure | null {
    const repairs = this.room.find(FIND_STRUCTURES, { filter: s => s.hits < s.hitsMax });
    var priorityIndex = 0;
    for (const [p, repairAt, _] of this.RepairPriorities) {
      // Get candidates and group by number of suppliers
      const needsRepair = repairs
        .filter(s => p(s) && (s.hits / s.hitsMax) < repairAt)
        .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax))
        .pop();

      if (needsRepair) return needsRepair;
      priorityIndex++;
    }

    // console.log(`No repairs found, searched ${priorityIndex} priority groups.`);
    return null;
  }

  TickTower(tower: StructureTower) {
    const supplyRatio = tower.store.getUsedCapacity(RESOURCE_ENERGY) / tower.store.getCapacity(RESOURCE_ENERGY);
    if (!tower.isActive || !supplyRatio) return; // RCL or Energy too low to work

    // Critical Tasks - Always performed regardless of ener

    // Attacks
    const hostiles = this.room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length && this.AttackHostiles && !this.DisableTowerAttacks) {
      this.room.visual.circle(tower.pos, { radius: this.TowerAttackRange, stroke: Colours.ATTACK_RANGE, opacity: 0.1, strokeWidth: 0.5 });

      // Find lowest health hostile in range
      const weakestHostile = tower.pos
        .findInRange(hostiles, this.TowerAttackRange)
        .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax))
        .pop();
      if (weakestHostile) {
        const res = tower.attack(weakestHostile);
        // console.log(`!!! Tower Attacked ${weakestHostile.name} from $${weakestHostile.owner.username} (${weakestHostile.hits}/${weakestHostile.hits}) with result ${res}!`);
        return;
      }
    }

    // My creeps in need of healing, weakest first
    const weakestFriendly = this.room.find(FIND_MY_CREEPS)
      .filter(c => c.hits < c.hitsMax)
      .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax))
      .pop();
    if (weakestFriendly) {
      const res = tower.heal(weakestFriendly);
      // console.log(`Tower Healed ${weakestFriendly.name} (${weakestFriendly.hits}/${weakestFriendly.hitsMax}) with result ${res}!`);
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
    const start = Game.flags["RoadStart"];
    const end = Game.flags["RoadEnd"];
    if (start && end) {
      // Find a path in the same room
      const path = start.pos.findPathTo(end, { maxRooms: 1, swampCost: 2, plainCost: 4, ignoreCreeps: true });
      var built = false;

      if (this.room.createConstructionSite(start.pos.x, start.pos.y, STRUCTURE_ROAD) === OK) built = true;
      for (const pos of path) if (this.room.createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD) === OK) built = true;
      if (this.room.createConstructionSite(end.pos.x, end.pos.y, STRUCTURE_ROAD) === OK) built = true;

      if (built) {
        start.remove();
        end.remove();
      }
    }
  }
}
