import { Role } from "role";

class MinerMemory extends Object {
  sourceId?: Id<Source>
}

export class Miner extends Role {
  RoleName = "Miner";
  CountPerRoom = 4;
  BodyParts = [MOVE, WORK, WORK, WORK];

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
        return; // We had to move so don't bother to act

      // Mine it
      creep.harvest(mineObj);
    }
  }

  LocateSource(creep: Creep): Id<Source> | undefined {
    const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE, { maxRooms: 1 });
    return source?.id;
  }
}
