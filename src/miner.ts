import { Role } from "role";

class MinerMemory extends Object {
  sourceId?: Id<Source>
}

export class Miner extends Role {
  RoleName = "Miner";

  get CountPerRoom() {
    // 2 x the number of active sources
    return this.room.find(FIND_SOURCES_ACTIVE).length * 2;
  }

  BodyParts = [MOVE, CARRY, CARRY, WORK, WORK, WORK];

  Tick(): void {
    for (const creep of this.CreepsInRole()) {
      const mem = creep.memory.jobMemory as MinerMemory;

      // Do we need to find a new source?
      if (mem.sourceId == undefined || mem.sourceId == null)
        mem.sourceId = this.LocateSource(creep);

      // Did we find nothing?
      if (mem.sourceId == null)
        continue; // No source located

      // Lookup object for the source
      const mineObj = Game.getObjectById(mem.sourceId);

      // If source was stale, reset it and do nothing.
      if (mineObj == null || mineObj == undefined) {
        mem.sourceId = undefined;
        continue; // Source was invalid
      }

      // Move right next to the source
      if (this.MoveCreep(creep, mineObj.pos, 1) != null)
        continue; // We had to move so don't bother to act

      // Mine it if we have room
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
        creep.harvest(mineObj);

      // If there are nearby Harvesters low on energy
      for (const harvester of creep.pos.findInRange(FIND_MY_CREEPS, 2, {
        filter: (c) => (
          (c.memory.role === "harvester" || c.memory.role === "harvesterT2")
          && c.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        )
      }))
        creep.transfer(harvester, RESOURCE_ENERGY); // Transer ours to them
    }
  }

  LocateSource(creep: Creep): Id<Source> | undefined {
    const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE, { maxRooms: 1 });
    return source?.id;
  }
}
