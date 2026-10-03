import { WorkerI, WorkerII } from "worker";
import { Miner } from "miner";
import { Settler } from "settler";

// Spawn priority order, lowest to highest
const Roles = [
  Settler,
  WorkerI,
  WorkerII,
  Miner,
];

export enum RoomStatus {
  Owned,
  Claimed,
  Neutral,
  Hostile
}

export class RoomManager {
  DefaultTowerAttackRange = 15;

  protected readonly room: Room;
  constructor(room: Room) {
    this.room = room;
  }

  static StatusOf(room: Room): RoomStatus {
    if (room.controller == undefined)
      return RoomStatus.Neutral;

    if (room.controller?.my)
      return RoomStatus.Owned;

    if ("Claimed" in room.find(FIND_FLAGS).keys())
      return RoomStatus.Claimed;

    // Assume hostile by default
    return RoomStatus.Hostile;
  }


  TickRoom() {
    if (RoomManager.StatusOf(this.room) === RoomStatus.Hostile) {
      console.log(`${this.room} !!! Skipping operations in Hostile room`)
      return;
    }

    this.InitRoomMemory();

    // Build any designated roads
    this.BuildRoads();

    // Run each tower in the room
    for (const tower of this.room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }))
      this.TickTower(tower as StructureTower);

    // Run each role in the room
    for (const roleType of Roles) {
      const role = new roleType(this.room); // Construct a role instance for the room
      role.TickRole(); // Run it
    }
  }

  InitRoomMemory() {
    if (this.room.memory.lastSpawnTick == null || this.room.memory.lastSpawnTick == undefined) this.room.memory.lastSpawnTick = {};
    if (this.room.memory.attackHostiles == undefined) this.room.memory.attackHostiles = false;
    if (this.room.memory.towerAttackRange == undefined) this.room.memory.towerAttackRange = this.DefaultTowerAttackRange;
  }

  TickTower(t: StructureTower) {
    if (!t.isActive)
      return; // RCL too low to work anyway

    if (t.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
      return; // No energy to work

    if (this.room.memory.attackHostiles ?? false) {
      // Find lowest health hostile in range
      const hostile = t.pos.findInRange(FIND_HOSTILE_CREEPS, this.room.memory.towerAttackRange ?? this.DefaultTowerAttackRange)
        .sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
      if (hostile != null && hostile != undefined) {
        t.attack(hostile);
        return;
      }
    }

    // Find my structures in most need of repair
    const myStruct = this.room.find(FIND_MY_STRUCTURES, { filter: s => s.hits < s.hitsMax })
      .sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
    if (myStruct != null && myStruct != undefined) {
      t.repair(myStruct);
      return;
    }

    // My creeps in need of healing, weakest first
    const weakling = this.room.find(FIND_MY_CREEPS, { filter: c => c.hits < c.hitsMax })
      .sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
    if (weakling != null && weakling != undefined) {
      t.heal(weakling);
      return;
    }

    // All other roads in most need of repair
    const road = this.room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax })
      .sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
    if (road != null && road != undefined) {
      t.repair(road);
      return;
    }

    // All other structures, weakest first
    const allStruct = this.room.find(FIND_STRUCTURES, { filter: s => s.hits < s.hitsMax })
      .sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
    if (allStruct != null && allStruct != undefined) {
      t.repair(allStruct);
      return;
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
