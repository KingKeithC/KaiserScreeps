import { CreepExtra } from "Creep";
import { CreepTask, Idle, Mine, TaskAction } from "Tasks";
import type { RoomExtra } from "Room";
import { CreepRole, CreepRoleBase } from "./Role";

export class Miner extends CreepRoleBase implements CreepRole {
  readonly groupName = "Miners";
  override readonly name: string = "Miner";
  override readonly tier: number = 1;

  GetNewCreepBody(_room: RoomExtra): BodyPartConstant[] {
    return [MOVE, CARRY, WORK, WORK, WORK, WORK];
  }

  override GetRoomQuota(room: RoomExtra) {
    const max = room.GetMinerPositions().length;
    const minerII = (room.AssignedCreepsByRoleName.get("MinerII") ?? []).length;
    return Math.max(0, max - minerII);
  }

  SelectNextTask(creep: CreepExtra, room: RoomExtra): CreepTask {
    const sourceId = this.LocateSource(creep, room);
    return sourceId ? new Mine(sourceId) : new Idle();
  }

  LocateSource(creep: CreepExtra, room: RoomExtra): Id<Source> | undefined {
    const miners = room.AssignedCreepsByRoleGroup.get("Miners") ?? [];

    const minersBySource = new Map<Id<Source>, number>();
    this.log.debug(`Locating Source, searching ${miners.length} miners...`, { "<creep>": creep, "<room>": room });
    for (const c of miners) {
      const task = c.currentTask;
      if (!task || task.action !== TaskAction.Mine) continue;
      const sourceId = (task as Mine).target;
      if (!sourceId) continue;
      minersBySource.set(sourceId, (minersBySource.get(sourceId) ?? 0) + 1);
    }
    this.log.debug(`minersBySource: ${JSON.stringify([...minersBySource])}`, { "<creep>": creep, "<room>": room });
    return room.Sources
      .map(source => ({ source, count: minersBySource.get(source.id) ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .pop()?.source.id;
  }

  TickCreep(creep: CreepExtra, room: RoomExtra): void {
    this.TransferToNeighbours(creep, room);
  }

  TransferToNeighbours(creep: CreepExtra, room: RoomExtra): void {
    type EnergyCarrier = CreepExtra | AnyStoreStructure;
    const closeNeedsEnergy = creep.pos.findInRange(
      [
        ...(room.AssignedCreepsByRoleName.get("WorkerI") ?? []),
        ...(room.AssignedCreepsByRoleName.get("WorkerII") ?? []),
        ...(room.AssignedCreepsByRoleName.get("WorkerIII") ?? []),
        ...(room.AssignedCreepsByRoleName.get("Settler") ?? []),
        ...room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER }),
      ] as EnergyCarrier[],
      1,
      {
        filter: (target): target is EnergyCarrier => "store" in target && target.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
      },
    )
      .sort((a, b) => {
        const aRatio = a.store.getUsedCapacity(RESOURCE_ENERGY) / a.store.getCapacity(RESOURCE_ENERGY);
        const bRatio = b.store.getUsedCapacity(RESOURCE_ENERGY) / b.store.getCapacity(RESOURCE_ENERGY);
        return aRatio - bRatio;
      })
      .pop();
    if (closeNeedsEnergy) creep.transfer(closeNeedsEnergy, RESOURCE_ENERGY);
  }
}

export class MinerII extends Miner {
  override readonly name: string = "MinerII";
  override readonly tier: number = 2;

  override GetNewCreepBody(_room: RoomExtra): BodyPartConstant[] {
    return [MOVE, CARRY, WORK, WORK, WORK, WORK, WORK, WORK, WORK];
  }

  override GetRoomQuota(room: RoomExtra) {
    return room.GetMinerPositions().length + 1;
  }
}
