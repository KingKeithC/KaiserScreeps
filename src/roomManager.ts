import { WorkerI, WorkerII } from "worker";
import { Miner } from "miner";
import { Settler } from "settler";
import { CreepExtra } from "creep";

// Spawn priority order, lowest to highest
const Roles = [
  Settler,
  WorkerI,
  WorkerII,
  Miner,
];

export enum RoomControlStatus {
  Owned,
  Claimed,
  Neutral,
  Hostile
}

export class RoomManager {

  TowerAttackRangeTiles: number = 15;
  TowerCriticalSupplyRatio: number;

  RoomEventLogMaxLength = 20;
  HostileReportFrequency = 10;

  readonly room: Room;
  constructor(room: Room) {
    this.room = room;
    this.TowerCriticalSupplyRatio = this.HostileCreepsInRoom.length > 0 ? 0.75 : 0.30;
    this.InitRoomMemory();
  }

  private _MyCreepsInRoom?: CreepExtra[];
  get MyCreepsInRoom(): CreepExtra[] {
    if (!this._MyCreepsInRoom) this._MyCreepsInRoom = CreepExtra.FindMineAssignedToRoom(this.room.name);
    return this._MyCreepsInRoom;
  }

  private _HostileCreepsInRoom?: CreepExtra[];
  get HostileCreepsInRoom(): CreepExtra[] {
    if (!this._HostileCreepsInRoom) this._HostileCreepsInRoom = CreepExtra.FindHostilesInRoom(this.room);
    return this._HostileCreepsInRoom;
  }

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

  TickRoom() {
    // All Rooms

    for (const roleType of Roles) {
      const role = new roleType(this); // Construct a role instance for the room
      role.TickRoom(); // Run it
    }

    if (this.room.memory.status === RoomControlStatus.Hostile) {
      console.log(`${this.room} !!! Skipping further operations in Hostile room`)
      return;
    }

    // Owned/Claimed/Neutral room
    this.CallOutHostiles();
    this.ProcessEventLog();

    // Build any designated roads
    this.BuildRoads();

    // Run each tower in the room
    for (const tower of this.room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }))
      this.TickTower(tower as StructureTower);
  }

  CallOutHostiles() {
    if (Game.time % this.HostileReportFrequency === 0 && this.HostileCreepsInRoom.length > 0) {
      const hostileDetails = this.HostileCreepsInRoom.map(c => {
        owner: c.owner
        name: c.name
        bodyCost: CreepExtra.BodyCost(c.body.map(p => p.type))
      });

      console.log(`${this.room} !!! ${this.HostileCreepsInRoom.length} hostiles spotted: ${JSON.stringify(hostileDetails)}`);
    }
  }

  ProcessEventLog() {
    const myCreepsIdsInRoom = this.MyCreepsInRoom.map(c => c.id);
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

  InitRoomMemory() {
    this.room.memory.status ??= RoomManager.StatusOf(this.room);
    this.room.memory.lastSpawnTick ??= {};
    this.room.memory.attackHostiles ??= false;
    this.room.memory.towerAttackRange ??= this.TowerAttackRangeTiles;
    this.room.memory.recentAttacksOnMyCreeps ??= [];
  }

  TickTower(t: StructureTower) {
    if (!t.isActive || t.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
      return; // RCL or Energy too low to work

    // Critical Tasks - Always performed regardless of ener

    if (this.room.memory.attackHostiles ?? false) {
      // Find lowest health hostile in range
      const hostile = t.pos.findInRange(FIND_HOSTILE_CREEPS, this.room.memory.towerAttackRange)
        .sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
      if (hostile != null && hostile != undefined) {
        t.attack(hostile);
        return;
      }
    }

    // My creeps in need of healing, weakest first
    const weakling = this.room.find(FIND_MY_CREEPS, { filter: c => c.hits < c.hitsMax })
      .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
    if (weakling != null && weakling != undefined) {
      t.heal(weakling);
      return;
    }

    const supplyRatio = t.store.getUsedCapacity(RESOURCE_ENERGY) / t.store.getCapacity(RESOURCE_ENERGY);
    if (supplyRatio >= this.TowerCriticalSupplyRatio) {

      // Find my structures in most need of repair
      const myStruct = this.room.find(FIND_MY_STRUCTURES, { filter: s => s.hits < s.hitsMax })
        .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
      if (myStruct != null && myStruct != undefined) {
        t.repair(myStruct);
        return;
      }

      // All other roads in most need of repair
      const road = this.room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax })
        .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
      if (road != null && road != undefined) {
        t.repair(road);
        return;
      }

      // All other structures, weakest first
      const allStruct = this.room.find(FIND_STRUCTURES, { filter: s => s.hits < s.hitsMax })
        .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
      if (allStruct != null && allStruct != undefined) {
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
