import { CreepExtra } from "Creep";
import { RoomRole } from "./Role";

class MinerMemory extends Object {
  sourceId?: Id<Source>;
}

export class Miner extends RoomRole<MinerMemory> {
  static readonly RoleName: string = "Miner";
  InitialJobMemory: MinerMemory = new MinerMemory();
  BodyParts = [MOVE, CARRY, WORK, WORK, WORK, WORK];

  DropoffRange = 4;

  get CountPerRoom() {
    const max = this.manager.GetMaxMiners() + 1;
    const T2 = Object.values(Game.creeps).filter(c => c.memory.room === this.manager.room.name && c.memory.role === 'MinerII').length;
    return max - T2 <= 0 ? 0 : max - T2;
  }

  LocateSource(creep: CreepExtra): Id<Source> | undefined {
    const minersBySource = new Map<Id<Source>, number>();
    for (const c of this.CreepsInRole) {
      const mem = c.memory.jobMemory as MinerMemory;
      if (!mem.sourceId) continue;
      minersBySource.set(mem.sourceId, (minersBySource.get(mem.sourceId) ?? 0) + 1);
    }
    return this.manager.room.find(FIND_SOURCES)
      .map(source => ({ source, count: minersBySource.get(source.id) ?? 0 }))
      .sort((b, a) => a.count - b.count)
      .pop()?.source.id;
  }

  TransferToNeighbours(creep: CreepExtra): void {
    const closeNeedsEnergy = creep.pos.findInRange([
      ...this.manager.CreepsByRole.get("WorkerI") ?? [],
      ...this.manager.CreepsByRole.get("WorkerII") ?? [],
      ...this.manager.CreepsByRole.get("WorkerIII") ?? [],
      ...this.manager.CreepsByRole.get("Settler") ?? [],
      ...this.manager.room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER }) as StructureContainer[],
    ], 1, { filter: c => c.store.getFreeCapacity(RESOURCE_ENERGY) })
      .sort((b, a) => (a.store.getUsedCapacity(RESOURCE_ENERGY) / a.store.getCapacity(RESOURCE_ENERGY)) - (b.store.getUsedCapacity(RESOURCE_ENERGY) / b.store.getCapacity(RESOURCE_ENERGY)))
      .pop();
    // Transer ours to them
    if (closeNeedsEnergy) creep.transfer(closeNeedsEnergy, RESOURCE_ENERGY);
  }

  TickCreep(creep: CreepExtra, mem: MinerMemory): void {
    if (!mem.sourceId) {
      mem.sourceId = this.LocateSource(creep);
      console.log(`${this.manager.room.name}${creep}: Miner assigned to ${mem.sourceId}...`);
      return;
    }

    const mineObj = Game.getObjectById(mem.sourceId);
    if (!mineObj) {
      mem.sourceId = this.LocateSource(creep);
      console.log(`${this.manager.room.name}${creep}: Stored source is stale, refreshed to ${mem.sourceId}...`);
      return;
    }

    // Transfer energy to any workers we can
    this.TransferToNeighbours(creep);

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
    if (selectedTarget instanceof Source) {
      if (mineObj.energy === 0) {
        creep.say("🏜️");
        console.log(`${this.manager.room.name}${creep}: Source is out of energy...`);
      } else
        creep.harvest(mineObj);
    }
    else
      creep.transfer(selectedTarget, RESOURCE_ENERGY);
  }
}

export class MinerII extends Miner {
  static readonly RoleName: string = "MinerII";
  BodyParts = [MOVE, CARRY, WORK, WORK, WORK, WORK, WORK, WORK, WORK];
  get CountPerRoom() { return this.manager.GetMaxMiners() + 1; }
}
