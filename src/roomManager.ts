import { Harvester, HarvesterT2 } from "harvester";
import { Miner } from "miner";

const Roles = [Miner, HarvesterT2, Harvester];

enum RoomStatus {
  Owned,
  Claimed,
  Neutral,
  Hostile
}

export class RoomManager {
  TowerAttackRange = 15;

  protected readonly room: Room;
  constructor(room: Room) {
    // Init Room Memory
    if (room.memory.countPreventingDowngrade == null || room.memory.countPreventingDowngrade == undefined)
      room.memory.countPreventingDowngrade = 0;
    if (room.memory.countPerformingUpgrade == null || room.memory.countPerformingUpgrade == undefined)
      room.memory.countPerformingUpgrade = 0;
    if (room.memory.lastSpawnTick == null || room.memory.lastSpawnTick == undefined)
      room.memory.lastSpawnTick = {};

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

  TickTower(t: StructureTower) {
    if (!t.isActive)
      return; // RCL too low to work anyway

    if (t.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
      return; // No energy to work

    // Find lowest health hostile in range
    const hostile = t.pos.findInRange(FIND_HOSTILE_CREEPS, this.TowerAttackRange).sort((a, b) => a.hits - b.hits).pop()
    if (hostile != null && hostile != undefined) {
      t.attack(hostile);
      return;
    }

    // Find my structures in need of repair
    const myStruct = t.pos.findClosestByRange(FIND_MY_STRUCTURES, { filter: s => s.hits < s.hitsMax })
    if (myStruct != null && myStruct != undefined) {
      t.repair(myStruct);
      return;
    }

    // My creeps in need of healing, weakest first
    const weakling = this.room.find(FIND_MY_CREEPS, { filter: c => c.hits < c.hitsMax }).sort((a, b) => a.hits - b.hits).pop()
    if (weakling != null && weakling != undefined) {
      t.heal(weakling);
      return;
    }

    // All other structures
    const road = t.pos.findClosestByRange(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax })
    if (road != null && road != undefined) {
      t.repair(road);
      return;
    }

    // All other structures
    const allStruct = t.pos.findClosestByRange(FIND_STRUCTURES, { filter: s => s.hits < s.hitsMax })
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

      for (const pos of path) {
        const construction = this.room.createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD);
        if (construction === OK) built = true;
      }

      if (built) {
        start.remove();
        end.remove();
      }
    }
  }
}
