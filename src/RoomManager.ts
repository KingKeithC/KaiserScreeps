import { CreepExtra } from "Creep";
import { RoomRole } from "Role";

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
    attackHostiles: boolean,
    disableWarriors: boolean,
    towerAttackRange: number,
    recentAttacksOnMyCreeps: [time: number, victim: Id<CreepExtra>][],
  }
}

export class RoomManager {

  readonly room: Room;

  readonly MyCreepsInRoom: CreepExtra[];
  readonly CreepsByRole: Map<string, CreepExtra[]> = new Map();

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

  constructor(room: Room, myCreepsInRoom: CreepExtra[]) {
    this.room = room;
    this.MyCreepsInRoom = myCreepsInRoom;

    // Init room if missing from memory
    if (!(this.room.name in Memory.rooms)) RoomManager.InitRoomMemory(room);

    // Sort all my creeps into exclusive groups
    for (const c of myCreepsInRoom) {
      if (c.memory.room === room.name) {
        this.AssignedCreeps.push(c);

        // Group creeps assigned to this room into lists by role
        if (RoomRole.Registry.has(c.memory.role)) {
          const creeps = this.CreepsByRole.get(c.memory.role) ?? [];
          creeps.push(c);
          this.CreepsByRole.set(c.memory.role, creeps);
        } else {
          console.log(`${room}${c}: Is assigned to unknown role: ${c.memory.role}`);
        }
      }
      else if (c.pos.roomName === room.name)
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

  TowerAttackRangeTiles: number = 15;
  TowerCriticalSupplyRatio: number;

  RoomEventLogMaxLength = 20;
  HostileReportFrequency = 10;

  static StatusOf(room: Room): RoomControlStatus {
    if (room.controller == undefined)
      return RoomControlStatus.Neutral;

    if (room.controller?.my)
      return RoomControlStatus.Owned;

    if ("Claimed" in room.find(FIND_FLAGS).keys())
      return RoomControlStatus.Claimed;

    // Assume hostile by default
    return RoomControlStatus.Hostile;
  }

  static InitRoomMemory(room: Room) {
    Memory.rooms ??= {};
    room.memory.status ??= RoomManager.StatusOf(room);
    room.memory.lastSpawnTick ??= {};
    room.memory.attackHostiles ??= false;
    room.memory.disableWarriors ??= false;
    room.memory.towerAttackRange ??= 20;
    room.memory.recentAttacksOnMyCreeps ??= [];
  }

  TickRoom(allRoomManagers: RoomManager[]) {
    // Any Room

    var offset = 0;
    for (const roleType of RoomRole.Registry.values()) {
      const role = new roleType(this); // Construct a role instance for the room
      role.SpawnTickOffet = offset;
      offset += 10; // Spawn each role about 10 ticks apart
      role.TickRoom(); // Run it
    }

    if (this.room.memory.status !== RoomControlStatus.Owned) {
      console.log(`${this.room} Not owned: ${this.room.memory.status}.`)
      return;
    }

    // Owned room

    // this.CallOutHostiles();
    // this.ProcessEventLog();

    // Build any designated roads
    this.BuildRoads();

    // Run each tower in the room
    for (const tower of this.Towers) this.TickTower(tower as StructureTower);
  }

  CallOutHostiles() {
    if (Game.time % this.HostileReportFrequency === 0 && this.HostileCreeps.length > 0) {
      const hostileDetails = this.HostileCreeps.map(c => {
        owner: c.owner.username
        name: c.name
        bodyCost: CreepExtra.BodyCost(c.body.map(p => p.type))
      });

      console.log(`${this.room} !!! ${this.HostileCreeps.length} hostiles spotted: ${JSON.stringify(hostileDetails)}`);
    }
  }

  ProcessEventLog() {
    const myCreepsIdsInRoom = this.AssignedCreeps.map(c => c.id);
    const newAttacksOnMyCreeps = this.room.getEventLog()
      .filter(e => e.event === EVENT_ATTACK && myCreepsIdsInRoom.includes(e.data.targetId as Id<CreepExtra>))
      .map(a => {
        time: Game.time - 1;
        victim: (a as { data: { targetId: string } }).data.targetId;
      });
    if (newAttacksOnMyCreeps.length > 0) {
      console.log(`ATTACKS PERFORMED IN ${this.room.name} AGAINST MY CREEPS:`)
      for (const att of newAttacksOnMyCreeps)
        console.log(JSON.stringify(att));
    }
  }

  TickTower(t: StructureTower) {
    const supplyRatio = t.store.getUsedCapacity(RESOURCE_ENERGY) / t.store.getCapacity(RESOURCE_ENERGY);
    if (!t.isActive || !supplyRatio) return; // RCL or Energy too low to work

    // Critical Tasks - Always performed regardless of ener

    // Find lowest health hostile in range
    if (this.room.memory.attackHostiles ?? false) {
      const weakestHostile = t.pos
        .findInRange(this.HostileCreeps, this.room.memory.towerAttackRange)
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
      // Walls/Ramparts
      const wallLike = [...this.Ramparts, ...this.Walls]
        .filter(w => w.hits < w.hitsMax)
        .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
      if (wallLike) {
        t.repair(wallLike);
        return;
      }

      // All roads in most need of repair
      const road = this.Roads
        .filter(r => r.hits < r.hitsMax)
        .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
      if (road) {
        t.repair(road);
        return;
      }

      // All other structures, weakest first
      const allStruct = this.MyStructures
        .filter(s => s.hits < s.hitsMax)
        .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
      if (allStruct) {
        t.repair(allStruct);
        return;
      }
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
