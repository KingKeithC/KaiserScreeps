import { RoomRole } from "role";

class MinerMemory extends Object {
  sourceId?: Id<Source>
}

export class Miner extends RoomRole<MinerMemory> {
  RoleName = "Miner";
  InitialJobMemory: MinerMemory = new MinerMemory();

  get CountPerRoom() {
    // 1 miner per source
    return this.room.find(FIND_SOURCES).length * 2;
  }

  BodyParts = [MOVE, CARRY, WORK, WORK, WORK, WORK];
  DropoffRange = 4;

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
    const nextdoor = creep.pos.findInRange(FIND_MY_CREEPS, 1, { filter: (c) => ((c.memory.role.startsWith("Worker")) && c.store.getFreeCapacity(RESOURCE_ENERGY) > 0) });
    const harvester = nextdoor.sort((a, b) => a.store.energy - b.store.energy).pop();
    if (harvester != null && harvester != undefined)
      creep.transfer(harvester, RESOURCE_ENERGY); // Transer ours to them

    const isFull = creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
    const nearbyCreeps = creep.pos.findInRange(FIND_MY_CREEPS, this.DropoffRange, { filter: (c) => ((c.memory.role.startsWith("Worker")) && c.store.getFreeCapacity(RESOURCE_ENERGY) > 0) });
    const nearestCreep = creep.pos.findClosestByPath(nearbyCreeps);
    const nearbyContainers = creep.pos.findInRange(FIND_STRUCTURES, this.DropoffRange, { filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    const nearestContainer = creep.pos.findClosestByPath(nearbyContainers);
    if (!isFull) {
      // Move right next to the source
      const moveResult = this.MoveCreep(creep, mineObj.pos, 1);
      if (moveResult != 1) return; // Not close enough to continue acting

      // Mine it
      const mineResult = creep.harvest(mineObj);
      if (mineResult !== OK && mineResult !== ERR_NOT_ENOUGH_ENERGY) console.log(`${this.room}${creep}: Miner failed to mine ${mineResult}`);
    } else if (nearestCreep instanceof Creep) {
      // Transfer to creep

      // Move right next to it
      if (this.MoveCreep(creep, nearestCreep.pos, 1) != 1) return; // Not close enough to transfer
      creep.transfer(nearestCreep, RESOURCE_ENERGY); // Transer ours to them
    } else if (nearestContainer instanceof StructureContainer) {
      // Transfer to container

      // Move right next to it
      if (this.MoveCreep(creep, nearestContainer.pos, 1) != 1) return; // Not close enough to transfer
      creep.transfer(nearestContainer, RESOURCE_ENERGY); // Transer
    }
  }

  LocateSource(creep: Creep): Id<Source> | undefined {
    const minersBySource = this.CreepsInRoomAndRole().reduce((counts, miner) => {
      const sourceId = (miner.memory.jobMemory as MinerMemory)?.sourceId;
      if (sourceId != null)
        counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
      return counts;
    }, new Map<Id<Source>, number>());

    const source = this.room.find(FIND_SOURCES)
      .map(source => ({ source, count: minersBySource.get(source.id) ?? 0 }))
      .sort((a, b) => a.count - b.count)[0]?.source;

    console.log(`${this.room}${creep}: Assigning Miner to ${source}...`);
    return source?.id;
  }
}
