import { CreepExtra } from "creep";
import { RoomRole } from "role";

class MinerMemory extends Object {
  sourceId?: Id<Source>
}

export class Miner extends RoomRole<MinerMemory> {
  RoleName = "Miner";
  InitialJobMemory: MinerMemory = new MinerMemory();

  get CountPerRoom() {
    // 1 miner per source
    return this.room.find(FIND_SOURCES).length * 3;
  }

  BodyParts = [MOVE, CARRY, WORK, WORK, WORK, WORK];
  DropoffRange = 4;

  TickCreep(creep: CreepExtra, mem: MinerMemory): void {
    // Do we need to find a new source?
    if (mem.sourceId == undefined || mem.sourceId == null)
      mem.sourceId = this.LocateSource(creep);

    // Did we find nothing?
    if (mem.sourceId == null) {
      console.log(`${this.room}${creep}: Unable to locate a source.`)
      return; // No source located
    }

    // Lookup object for the source
    const mineObj = Game.getObjectById(mem.sourceId);

    // If source was stale, unset it it and do nothing.
    if (mineObj == null || mineObj == undefined) {
      mem.sourceId = undefined;
      return; // Source was invalid
    }

    // Transfer energy to any workers we can
    const closeWorker = creep.pos
      .findInRange(FIND_MY_CREEPS, 1, {
        filter: (c) =>
        ((c.memory.role.startsWith("Worker"))
          && c.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
      })
      .sort((a, b) => a.store.energy - b.store.energy)
      .pop();
    if (closeWorker)
      creep.transfer(closeWorker, RESOURCE_ENERGY); // Transer ours to them

    const nearbyCreeps: CreepExtra[] = creep.pos.findInRange(FIND_MY_CREEPS, this.DropoffRange, { filter: (c) => ((c.memory.role.startsWith("Worker")) && c.store.getFreeCapacity(RESOURCE_ENERGY) > 0) });
    const nearbyContainers: StructureContainer[] = creep.pos.findInRange(FIND_STRUCTURES, this.DropoffRange, { filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    const nearestClient = creep.pos.findClosestByPath([...nearbyContainers, ...nearbyCreeps]);

    // Select the mine as the target by default, but switch to the
    // nearestClient if we are full and there is a target.
    let selectedTarget: Source | Creep | StructureContainer = mineObj;
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 && nearestClient)
      selectedTarget = nearestClient;

    // Move until in range to act
    if (creep.MoveCreep(selectedTarget.pos, { range: 1 }) != 1) return;

    // Act
    if (selectedTarget instanceof Source)
      creep.harvest(mineObj);
    else
      creep.transfer(selectedTarget, RESOURCE_ENERGY);
  }

  LocateSource(creep: CreepExtra): Id<Source> | undefined {
    const minersBySource = this.CreepsInRoomAndRole.reduce((counts, miner) => {
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
