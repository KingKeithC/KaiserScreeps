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

      // If there are nearby Harvesters low on energy
      const nextdoor = creep.pos.findInRange(FIND_MY_CREEPS, 1, { filter: (c) => ((c.memory.role === "harvester" || c.memory.role === "harvesterT2") && c.store.getFreeCapacity(RESOURCE_ENERGY) > 0) });
      const harvester = nextdoor.sort((a, b) => a.store.energy - b.store.energy).pop();
      if (harvester != null && harvester != undefined)
        creep.transfer(harvester, RESOURCE_ENERGY); // Transer ours to them

      const isFull = creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
      const nearby = creep.pos.findInRange(FIND_MY_CREEPS, 5, { filter: (c) => ((c.memory.role === "harvester" || c.memory.role === "harvesterT2") && c.store.getFreeCapacity(RESOURCE_ENERGY) > 0) });
      if (!isFull) {
        // Move right next to the source
        const moveResult = this.MoveCreep(creep, mineObj.pos, 1);
        if (moveResult != 1) continue; // Not close enough to continue acting

        // Mine it
        const mineResult = creep.harvest(mineObj);
        if (mineResult !== OK && mineResult !== ERR_NOT_ENOUGH_ENERGY) console.log(`${this.room}${creep}: Miner failed to mine ${mineResult}`);
      } else if (nearby.length > 0) {
        // Find the one with the lowest energy
        const harvester = nearby.sort((a, b) => a.store.energy - b.store.energy).pop();
        if (harvester == null || harvester == undefined)
          continue;

        // Move right next to it
        const moveResult = this.MoveCreep(creep, harvester.pos, 1);
        if (moveResult != 1) continue; // Not close enough to transfer

        creep.transfer(harvester, RESOURCE_ENERGY); // Transer ours to them
      }
    }
  }

  LocateSource(creep: Creep): Id<Source> | undefined {
    const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE, { maxRooms: 1 });
    return source?.id;
  }
}
