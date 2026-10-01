import { Role } from "role";

class MinerMemory extends Object {
  sourceId?: Id<Source>
}

export class Miner extends Role<MinerMemory> {
  RoleName = "Miner";
  InitialJobMemory: MinerMemory = new MinerMemory();

  get CountPerRoom() {
    // 2 x the number of active sources
    return this.room.find(FIND_SOURCES_ACTIVE).length * 2;
  }

  BodyParts = [MOVE, CARRY, CARRY, WORK, WORK, WORK];

  TickCreep(creep: Creep, mem: MinerMemory): void {
    // Do we need to find a new source?
    if (mem.sourceId == undefined || mem.sourceId == null)
      mem.sourceId = this.LocateSource(creep);

    // Did we find nothing?
    if (mem.sourceId == null)
      return; // No source located

    // Lookup object for the source
    const mineObj = Game.getObjectById(mem.sourceId);

    // If source was stale, reset it and do nothing.
    if (mineObj == null || mineObj == undefined) {
      mem.sourceId = undefined;
      return; // Source was invalid
    }

    // If there are nearby Harvesters low on energy
    const nextdoor = creep.pos.findInRange(FIND_MY_CREEPS, 1, { filter: (c) => ((c.memory.role === "harvester" || c.memory.role === "harvesterT2") && c.store.getFreeCapacity(RESOURCE_ENERGY) > 0) });
    const harvester = nextdoor.sort((a, b) => a.store.energy - b.store.energy).pop();
    if (harvester != null && harvester != undefined)
      creep.transfer(harvester, RESOURCE_ENERGY); // Transer ours to them

    const isFull = creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
    const nearbyCreeps = creep.pos.findInRange(FIND_MY_CREEPS, 5, { filter: (c) => ((c.memory.role === "harvester" || c.memory.role === "harvesterT2") && c.store.getFreeCapacity(RESOURCE_ENERGY) > 0) });
    const nearbyContainers = creep.pos.findInRange(FIND_STRUCTURES, 5, { filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    if (!isFull) {
      // Move right next to the source
      const moveResult = this.MoveCreep(creep, mineObj.pos, 1);
      if (moveResult != 1) return; // Not close enough to continue acting

      // Mine it
      const mineResult = creep.harvest(mineObj);
      if (mineResult !== OK && mineResult !== ERR_NOT_ENOUGH_ENERGY) console.log(`${this.room}${creep}: Miner failed to mine ${mineResult}`);
    } else if (nearbyCreeps.length > 0) {
      // Transfer to creep

      // Find the one with the lowest energy
      const harvester = nearbyCreeps.sort((a, b) => a.store.energy - b.store.energy).pop();
      if (harvester == null || harvester == undefined)
        return;

      // Move right next to it
      const moveResult = this.MoveCreep(creep, harvester.pos, 1);
      if (moveResult != 1) return; // Not close enough to transfer

      creep.transfer(harvester, RESOURCE_ENERGY); // Transer ours to them
    } else if (nearbyContainers.length > 0) {
      // Transfer to container

      // Move right next to it
      const moveResult = this.MoveCreep(creep, nearbyContainers[0].pos, 1);
      if (moveResult != 1) return; // Not close enough to transfer
      creep.transfer(nearbyContainers[0], RESOURCE_ENERGY); // Transer
    }
  }

  LocateSource(creep: Creep): Id<Source> | undefined {
    // Sort by a constant value (the number of a's I guess)
    const sources = creep.room.find(FIND_SOURCES_ACTIVE).sort((a, b) => a.id.split('a').length - b.id.split('a').length);

    // Take either the first or last source
    var source;
    if (Game.time % 2 == 0)
      source = sources.pop();
    else
      source = sources[0];

    return source?.id;
  }
}
