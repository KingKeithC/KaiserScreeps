import { CreepExtra } from "Creep";
import { Colours } from "Data";
import { sortBy } from "lodash";
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
    lastSpawnTick: { [roleName: string]: number; };
    quotas?: { [roleName: string]: number; };
    enableVisuals?: boolean,
    enableRepairOverlay?: boolean,
    attackHostiles: boolean,
    disableWarriors: boolean,
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

  get Status(): RoomControlStatus { return this.room.memory.status ?? RoomExtra.StatusOf(this.room); }
  get EnableVisuals(): boolean { return this.room.memory.enableVisuals ?? true; }
  get EnableRepairOverlay(): boolean { return this.room.memory.enableRepairOverlay ?? false; }
  get AttackHostiles(): boolean { return this.room.memory.attackHostiles ?? true; }
  get DisableWarriors(): boolean { return this.room.memory.disableWarriors ?? false; }
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
  GetMaxMiners(): number {
    const sources = this.room.find(FIND_SOURCES);
    const terrain = this.room.getTerrain();
    var spaces = 0;
    var possibleMiners = 0;

    for (const s of sources)
      // Given the source.pos is the centre point
      // get the positions of all the surrounding spaces
      for (var x = s.pos.x - 1; x <= s.pos.x + 1; x++)
        for (var y = s.pos.y - 1; y <= s.pos.y + 1; y++) {
          if (x === s.pos.x && y === s.pos.y) continue; // Skip centre point
          if (terrain.get(x, y) === 0) possibleMiners++;
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

  get AssignedCreeps(): CreepExtra[] {
    return this.room.find(FIND_MY_CREEPS, {
      filter: c =>
        c.my && !c.spawning && c.memory.room === this.room.name
    }).map(c => new CreepExtra(c.id));
  }

  // Group creeps assigned to this room into lists by role
  get CreepsByRole(): Map<string, CreepExtra[]> {
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
    // Any Room

    // Run all our roles in the room
    for (const role of this.RoleInstances.values())
      role.TickRole(); // Run it

    if (Game.time % this.NotificationFrequency === 0) this.RoomStateReport();

    if (this.Status !== RoomControlStatus.Owned) {
      console.log(`[${this.room}]: Not owned: ${this.Status}.`);
      return;
    }

    // Owned room

    this.CallOutHostiles();

    // Handle events, if not disabled
    if (!this.DisableEvents) {
      this.ProcessEventsLastTick();

      if (Game.cpu.bucket === 10000) {
        const res = Game.cpu.generatePixel();
        console.log(`!!! Invoked Game.cpu.generatePixel() resulting in ${res}.`);
        this.room.memory.recentEvents.push(({
          event: `Generate Pixel ${res}`,
          summary: `Generate Pixel ${res}`,
          time: Game.time,
          value: null,
        }));
      }

      if (Game.time % this.EventReportingFrequencyTicks === 0) this.PrintEventSummary();
    }

    // Build any designated roads
    this.BuildRoads();

    // Run each tower in the room
    for (const tower of this.Towers)
      this.TickTower(tower as StructureTower);

    if (this.EnableVisuals && this.EnableRepairOverlay) this.DrawRepairOverlay();
  }

  RoomStateReport(): void {
    var msg = `T${Game.time} ROOM ${this.room.name} REPORT ::: ${this.RoleInstances.size} Roles`;
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

  CallOutHostiles() {
    const hostiles = this.room.find(FIND_HOSTILE_CREEPS);
    if (Game.time % this.NotificationFrequency === 0 && hostiles.length > 0) {
      const hostileDetails: HostileInfo[] = hostiles.map(c => ({
        owner: c.owner.username,
        name: c.name,
        bodyCost: CreepExtra.BodyCost(c.body.map(p => p.type)),
        partCounts: c.body.reduce((counts, part) => {
          counts[part.type] = (counts[part.type] ?? 0) + 1;
          return counts;
        }, {} as Record<string, number>),
      }));
      const msg = `[${this.room}] !!! ${hostiles.length} hostiles spotted: ${JSON.stringify(hostileDetails)}`;
      console.log(msg);
      if (hostiles.length > this.HostileNotificationThreshold) {
        Game.notify(`${Game.time}: More than ${this.HostileNotificationThreshold} hostiles spotted in ${this.room.name}:\n\n${msg}!`);
      }
    }
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

  FindRepairByPriority(): AnyStructure | null {
    // Weakest Walls/Ramparts
    const wallsRamparts = this.room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL });
    const wallLike = wallsRamparts
      .filter(w => w.hits < w.hitsMax)
      .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop();
    if (wallLike) return wallLike;

    // Weakest Owned Structure (except ramparts)
    const allStruct = this.room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType !== STRUCTURE_RAMPART })
      .filter(s => s.hits < s.hitsMax)
      .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop();
    if (allStruct) return allStruct;

    // Weakest roads
    const road = this.room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_ROAD })
      .filter(r => r.hits < r.hitsMax)
      .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop();
    if (road) return road;

    return null;
  }

  TickTower(t: StructureTower) {
    const supplyRatio = t.store.getUsedCapacity(RESOURCE_ENERGY) / t.store.getCapacity(RESOURCE_ENERGY);
    if (!t.isActive || !supplyRatio) return; // RCL or Energy too low to work

    // Critical Tasks - Always performed regardless of ener

    // Find lowest health hostile in range
    if (this.AttackHostiles) {
      const weakestHostile = t.pos
        .findInRange(this.room.find(FIND_HOSTILE_CREEPS), this.TowerAttackRange)
        .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax))
        .pop();
      if (weakestHostile) {
        this.room.visual.circle(t.pos, { radius: this.TowerAttackRange, stroke: Colours.ATTACK_RANGE });
        const res = t.attack(weakestHostile);
        console.log(`!!! Tower Attacked ${weakestHostile.name} from $${weakestHostile.owner.username} (${weakestHostile.hits}/${weakestHostile.hits}) with result ${res}!`);
        return;
      }
    }

    // My creeps in need of healing, weakest first
    const weakestFriendly = this.room.find(FIND_MY_CREEPS)
      .filter(c => c.hits < c.hitsMax)
      .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax))
      .pop();
    if (weakestFriendly) {
      const res = t.heal(weakestFriendly);
      console.log(`Tower Healed ${weakestFriendly.name} (${weakestFriendly.hits}/${weakestFriendly.hitsMax}) with result ${res}!`);
      return;
    }

    if (supplyRatio >= this.TowerCriticalSupplyRatio) {
      const needRepair = this.FindRepairByPriority();
      if (needRepair) t.repair(needRepair);
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
