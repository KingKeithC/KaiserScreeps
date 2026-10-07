import { CreepExtra } from "Creep";
import { Colours } from "Data";
import { RoomRole } from "roles/Role";
import { countGraphemes } from 'unicode-segmenter/grapheme';

declare global {
  interface RoomMemory {
    lastSpawnTick: { [roleName: string]: number }
    quotas?: { [roleName: string]: number }
    enableVisuals?: boolean,
    attackHostiles: boolean,
    disableWarriors: boolean,
    towerAttackRange: number,
    disableEvents?: boolean,
    recentEvents: EventSummary[],
    eventReportingFrequencyTicks: number,
    maxEventLogPerRoom: number,
    hostileReportFrequency: number,
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
  partCounts: { [part: string]: number };
}

export class RoomExtra extends Room {

  get EnableVisuals(): boolean { return this.memory.enableVisuals ?? true }
  get AttackHostiles(): boolean { return this.memory.attackHostiles ?? true }
  get DisableWarriors(): boolean { return this.memory.disableWarriors ?? false }
  get TowerAttackRange(): number { return this.memory.towerAttackRange ?? 75 }
  get DisableEvents(): boolean { return this.memory.disableEvents ?? false }
  get RecentEvents(): EventSummary[] { return this.memory.recentEvents ?? [] }
  get EventReportingFrequencyTicks(): number { return this.memory.eventReportingFrequencyTicks ?? 250 }
  get MaxEventLogPerRoom(): number { return this.memory.maxEventLogPerRoom ?? 2000 }
  get HostileReportFrequency(): number { return this.memory.hostileReportFrequency ?? 10 }

  LastSpawnTick(role: RoomRole<Object>): number { return this.memory.lastSpawnTick[role.RoleName] ?? 0; }
  Quota(role: RoomRole<Object>): number { return (this.memory.quotas ?? {})[role.RoleName] ?? role.CountPerRoom; }

  TowerAttackRangeTiles: number = 15;
  TowerCriticalSupplyRatio: number = 0.50;

  TickRoom(allRoomManagers: RoomExtra[]) {
    var offset = 0;
    for (const roleType of RoomRole.Registry.values()) {
      const role = new roleType(this); // Construct a role instance for the room
      role.SpawnTickOffet = offset;
      offset += 10; // Spawn each role about 10 ticks apart
      role.TickRole(); // Run it
    }

    // Owned room

    this.CallOutHostiles();

    // Handle events, if not disabled
    if (!(this.memory.disableEvents ?? false)) {
      this.ProcessEventsLastTick();
      if (Game.time % this.EventReportingFrequencyTicks === 0) this.PrintEventSummary();
    }

    // Build any designated roads
    this.BuildRoads();

    // Run each tower in the room
    for (const tower of this.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }))
      this.TickTower(tower as StructureTower);
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
    for (const e of this.RecentEvents) {
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
    summary += `============= ${this.name} EVENT SUMMARY FROM ${start} to ${end} (~${this.EventReportingFrequencyTicks} Ticks) =============`;
    summary += `\n   ${headers[0].padEnd(widths[0])} ${headers[1].padStart(widths[1])} ${headers[2].padStart(widths[2])}`;
    summary += `\n   ${"-".repeat(headers[0].length).padEnd(widths[0])} ${"-".repeat(headers[1].length).padStart(widths[1])} ${"-".repeat(headers[2].length).padStart(widths[2])}`;
    for (const c of printorder) {
      const [count, amount] = summaryByEvent.get(c) ?? [-1, null];
      summary += `\n - ${c.padEnd(widths[0])}: ${count.toString().padStart(widths[1])} ${amount ? amount?.toString().padStart(widths[2]) : "<>".padStart(widths[2])}`;
    }
    summary += `\n================================= ${grandTotalEventCount.toString().padStart(5)} TOTAL EVENTS ==================================`;

    // Print it
    console.log(summary);

    // Wipe the event log
    this.memory.recentEvents = [];
  }

  CallOutHostiles() {
    const hostiles = this.find(FIND_HOSTILE_CREEPS);
    if (Game.time % this.HostileReportFrequency === 0 && hostiles.length > 0) {
      const hostileDetails: HostileInfo[] = hostiles.map(c => ({
        owner: c.owner.username,
        name: c.name,
        bodyCost: CreepExtra.BodyCost(c.body.map(p => p.type)),
        partCounts: c.body.reduce((counts, part) => {
          counts[part.type] = (counts[part.type] ?? 0) + 1;
          return counts;
        }, {} as Record<string, number>),
      }));
      console.log(`[${this.name}] !!! ${hostiles.length} hostiles spotted: ${JSON.stringify(hostileDetails)}`);
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
    const events = this.getEventLog();
    this.memory.recentEvents = (this.memory.recentEvents ?? []).concat(events.map(e => ({
      time: Game.time - 1,
      event: this.EventConstantToName(e.event),
      summary: this.EventItemToSummary(e),
      value: this.EventDataToValue(e),
    }))).slice(-this.MaxEventLogPerRoom);

    const myCreepsIdsInRoom = CreepExtra.FindWithRoom(this.name).map(c => c.id);
    const newAttacksOnMyCreeps = events
      .filter(e => e.event === EVENT_ATTACK && myCreepsIdsInRoom.includes(e.data.targetId as Id<CreepExtra>))
      .map(a => ({
        time: Game.time - 1,
        victim: (a as { data: { targetId: string } }).data.targetId,
      }));
    if (newAttacksOnMyCreeps.length > 0) {
      console.log(`ATTACKS PERFORMED IN [${this.name}] AGAINST MY CREEPS: `)
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
    const wallsRamparts = this.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL });
    const wallLike = wallsRamparts
      .filter(w => w.hits < w.hitsMax)
      .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop();
    if (wallLike) return wallLike;

    // Weakest Owned Structure (except ramparts)
    const allStruct = this.find(FIND_MY_STRUCTURES, { filter: s => s.structureType !== STRUCTURE_RAMPART })
      .filter(s => s.hits < s.hitsMax)
      .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop();
    if (allStruct) return allStruct;

    // Weakest roads
    const road = this.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_ROAD })
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
    if (this.memory.attackHostiles ?? false) {
      const range = (this.memory.towerAttackRange ?? this.TowerAttackRangeTiles);
      const weakestHostile = t.pos
        .findInRange(this.find(FIND_HOSTILE_CREEPS), range)
        .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax))
        .pop();
      if (weakestHostile) {
        this.visual.circle(t.pos, { radius: range, stroke: Colours.ATTACK_RANGE });
        t.attack(weakestHostile);
        return;
      }
    }

    // My creeps in need of healing, weakest first
    const weakestFriendly = CreepExtra.FindWithRoom(this.name)
      .filter(c => c.hits < c.hitsMax)
      .sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax))
      .pop();
    if (weakestFriendly) {
      t.heal(weakestFriendly);
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
