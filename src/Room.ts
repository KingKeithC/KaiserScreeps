import { CreepExtra } from "Creep";
import { RoomRole } from "roles/Role";

export enum RoomControlStatus {
  Owned,
  Claimed,
  Neutral,
  Hostile
}

declare global {
  interface RoomMemory {
    status: RoomControlStatus,
    lastSpawnTick: { [roleName: string]: number }
    quotas?: { [roleName: string]: number }
    attackHostiles: boolean,
    disableWarriors: boolean,
    towerAttackRange: number,
    recentEvents: EventSummary[],
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

export class RoomExtra {

  readonly room: Room;

  get name(): string { return this.room.name; }
  get controller(): StructureController | undefined { return this.room.controller; }
  get memory(): RoomMemory { return this.room.memory; }
  get energyAvailable(): number { return this.room.energyAvailable; }
  get energyCapacityAvailable(): number { return this.room.energyCapacityAvailable; }

  toString(): string { return this.room.toString(); }

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

  static InitRoomMemory(room: Room) {
    console.log(`[${this.name}]: Initializing Memory for new Room...`);
    Memory.rooms ??= {};
    room.memory.status ??= RoomExtra.StatusOf(room);
    room.memory.lastSpawnTick ??= {};
    room.memory.attackHostiles ??= false;
    room.memory.disableWarriors ??= false;
    room.memory.towerAttackRange ??= 20;
    room.memory.recentEvents ??= [];
  }

  EventReportingFrequencyTicks = 100;
  MaxEventLogPerRoom = 2000;

  readonly MyCreepsInRoom: CreepExtra[];

  // Mutually Exclusive Creep Groups
  readonly HostileCreeps: CreepExtra[] = [];
  readonly AssignedCreeps: CreepExtra[] = [];
  readonly UnassignedCreeps: CreepExtra[] = [];
  readonly MyCreepsAssignedElsewhere: CreepExtra[] = [];

  readonly MyStructures: AnyOwnedStructure[] = [];
  readonly ConstructionSites: ConstructionSite<BuildableStructureConstant>[] = [];
  readonly Sources: Source[] = [];

  // Mutually exclusive Structure Groups
  readonly Towers: StructureTower[] = [];
  readonly Spawns: StructureSpawn[] = [];
  readonly SpawnExtensions: StructureExtension[] = [];
  readonly OtherMyStructures: AnyOwnedStructure[] = [];
  readonly HostileStructures: AnyOwnedStructure[] = [];
  readonly Containers: StructureContainer[] = [];
  readonly Walls: StructureWall[] = [];
  readonly Ramparts: StructureRampart[] = [];
  readonly Roads: StructureRoad[] = [];
  readonly OtherNeutralStructures: AnyStructure[] = [];

  TowerAttackRangeTiles: number = 15;
  TowerCriticalSupplyRatio: number = 0.50;

  HostileReportFrequency = 10;

  constructor(room: Room, myCreepsInRoom: CreepExtra[] = []) {
    this.room = room;

    this.MyCreepsInRoom = myCreepsInRoom;

    // Sort all creeps in the room into exclusive groups
    for (const c of myCreepsInRoom) {
      if (c.memory.room === this.name) {
        this.AssignedCreeps.push(c);
      }
      else if (c.pos.roomName === this.name)
        this.UnassignedCreeps.push(c);
      else
        this.MyCreepsAssignedElsewhere.push(c);
    }

    // We should be able to access all my creeps in the colony
    // as well as hostiles in this room from this instance.
    this.HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
    this.ConstructionSites = room.find(FIND_CONSTRUCTION_SITES);
    this.Sources = room.find(FIND_SOURCES);

    // Sort all the structures in the room into groups
    for (const s of room.find(FIND_STRUCTURES)) {
      if (s instanceof OwnedStructure) {
        if (s.my) this.MyStructures.push(s);

        if (s.structureType === STRUCTURE_SPAWN)
          this.Spawns.push(s);
        else if (s.structureType === STRUCTURE_EXTENSION)
          this.SpawnExtensions.push(s);
        else if (s.structureType === STRUCTURE_TOWER)
          this.Towers.push(s);
        else if (s.structureType === STRUCTURE_RAMPART)
          this.Ramparts.push(s);
        else if (s.my)
          this.OtherMyStructures.push(s)
        else
          this.HostileStructures.push(s)
      } else {
        if (s.structureType === STRUCTURE_CONTAINER)
          this.Containers.push(s);
        else if (s.structureType === STRUCTURE_WALL)
          this.Walls.push(s);
        else if (s.structureType === STRUCTURE_ROAD)
          this.Roads.push(s);
        else
          this.OtherNeutralStructures.push(s);
      }
    }

    // Other Properties dependent on those above
    this.TowerCriticalSupplyRatio = this.HostileCreeps.length > 0 ? 0.90 : 0.60;
  }

  get SpawnsOrExtensions() { return [...this.Spawns, ...this.SpawnExtensions]; }

  // Group creeps assigned to this room into lists by role
  get CreepsByRole(): Map<string, CreepExtra[]> {
    const map = new Map();
    for (const c of this.AssignedCreeps)
      if (RoomRole.Registry.has(c.memory.role)) {
        const creeps = map.get(c.memory.role) ?? [];
        creeps.push(c);
        map.set(c.memory.role, creeps);
      } else {
        console.log(`[${this.name}]${c}: Is assigned to unknown role: ${c.memory.role}`);
      }
    return map;
  }

  TickRoom(allRoomManagers: RoomExtra[]) {
    // Init room if missing from memory
    if (!(this.name in Memory.rooms)) RoomExtra.InitRoomMemory(this.room);

    // Any Room

    var offset = 0;
    for (const roleType of RoomRole.Registry.values()) {
      const role = new roleType(this); // Construct a role instance for the room
      role.SpawnTickOffet = offset;
      offset += 10; // Spawn each role about 10 ticks apart
      role.TickRole(); // Run it
    }

    if (this.memory.status !== RoomControlStatus.Owned) {
      console.log(`[${this.name}]: Not owned: ${this.memory.status}.`)
      return;
    }

    // Owned room

    this.CallOutHostiles();
    this.ProcessEventsLastTick();
    if (Game.time % this.EventReportingFrequencyTicks === 0) this.PrintEventSummary();

    // Build any designated roads
    this.BuildRoads();

    // Run each tower in the room
    for (const tower of this.Towers) this.TickTower(tower as StructureTower);
  }

  PrintEventSummary() {
    const end = Game.time;
    const start = end - this.EventReportingFrequencyTicks;
    const summaryByEvent = new Map<string, [number, number | null]>();
    var grandTotalEventCount = 0;
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
      if (e.event.length > widths[0]) widths[0] = e.event.length;
      if (newCount.toString().length > widths[1]) widths[1] = newCount.toString().length;
      if (newTotal && newTotal.toString().length > widths[2]) widths[2] = newTotal.toString().length;

      // Update the group
      summaryByEvent.set(e.event, [newCount, newTotal]);
    }

    // Construct the actual message
    summary += `    ============= EVENT SUMMARY FROM ${start} to ${end} (~${this.EventReportingFrequencyTicks} Ticks) =============`;
    summary += `\n${"Event Name".padEnd(widths[0])} ${"Count".padStart(widths[1])} ${"Sum of Amount".padStart(widths[2])}`;
    for (const [c, [count, amount]] of summaryByEvent.entries())
      summary += `\n\t${c.padEnd(widths[0])}: ${count.toString().padStart(widths[1])}, ${amount ? amount?.toString().padStart(widths[2]) : "<>"}`;
    summary += `\n    ================================= ${grandTotalEventCount} TOTAL EVENTS =========================================`;

    // Print it
    console.log(summary);
  }

  CallOutHostiles() {
    if (Game.time % this.HostileReportFrequency === 0 && this.HostileCreeps.length > 0) {
      const hostileDetails: HostileInfo[] = this.HostileCreeps.map(c => ({
        owner: c.owner.username,
        name: c.name,
        bodyCost: CreepExtra.BodyCost(c.body.map(p => p.type)),
        partCounts: c.body.reduce((counts, part) => {
          counts[part.type] = (counts[part.type] ?? 0) + 1;
          return counts;
        }, {} as Record<string, number>),
      }));
      console.log(`[${this.name}] !!! ${this.HostileCreeps.length} hostiles spotted: ${JSON.stringify(hostileDetails)}`);
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
    const events = this.room.getEventLog();
    this.room.memory.recentEvents = (this.room.memory.recentEvents ?? []).concat(events.map(e => ({
      time: Game.time - 1,
      event: this.EventConstantToName(e.event),
      summary: this.EventItemToSummary(e),
      value: this.EventDataToValue(e),
    }))).slice(-this.MaxEventLogPerRoom);

    const myCreepsIdsInRoom = this.AssignedCreeps.map(c => c.id);
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

  FindNearestRepair(pos: RoomPosition): AnyStructure | null {
    var candidates: AnyStructure[] = [];

    // Weakest Owned Structure (except ramparts)
    candidates.concat(this.MyStructures
      .filter(s => s.structureType !== STRUCTURE_RAMPART)
      .filter(s => s.hits < s.hitsMax)
      .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax))
    );

    // Weakest roads
    candidates.concat(this.Roads
      .filter(r => r.hits < r.hitsMax)
      .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax))
    );

    // Weakest Walls/Ramparts
    const wallsRamparts = [...this.Ramparts, ...this.Walls];
    candidates.concat(wallsRamparts
      .filter(w => w.hits < w.hitsMax)
      .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax))
    );

    return pos.findClosestByPath(candidates, { ignoreCreeps: true });
  }

  FindMostNeededRepair(): AnyStructure | null {
    // Weakest Owned Structure (except ramparts)
    const allStruct = this.MyStructures.filter(s => s.structureType !== STRUCTURE_RAMPART)
      .filter(s => s.hits < s.hitsMax)
      .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
    if (allStruct) return allStruct;

    // Weakest roads
    const road = this.Roads
      .filter(r => r.hits < r.hitsMax)
      .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
    if (road) return road;

    // Weakest Walls/Ramparts
    const wallsRamparts = [...this.Ramparts, ...this.Walls];
    const wallLike = wallsRamparts
      .filter(w => w.hits < w.hitsMax)
      .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
    if (wallLike) return wallLike;

    return null;
  }

  TickTower(t: StructureTower) {
    const supplyRatio = t.store.getUsedCapacity(RESOURCE_ENERGY) / t.store.getCapacity(RESOURCE_ENERGY);
    if (!t.isActive || !supplyRatio) return; // RCL or Energy too low to work

    // Critical Tasks - Always performed regardless of ener

    // Find lowest health hostile in range
    if (this.memory.attackHostiles ?? false) {
      const weakestHostile = t.pos
        .findInRange(this.HostileCreeps, this.memory.towerAttackRange)
        .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax))
        .pop();
      if (weakestHostile != null && weakestHostile != undefined) {
        t.attack(weakestHostile);
        return;
      }
    }

    // My creeps in need of healing, weakest first
    const weakestFriendly = this.MyCreepsInRoom
      .filter(c => c.hits < c.hitsMax)
      .sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax))
      .pop();
    if (weakestFriendly) {
      t.heal(weakestFriendly);
      return;
    }

    if (supplyRatio >= this.TowerCriticalSupplyRatio) {
      const needRepair = this.FindMostNeededRepair();
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
