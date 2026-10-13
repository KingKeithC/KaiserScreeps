import { CreepExtra } from "Creep";
import { CreepTask, Idle, Mine, TaskAction } from "Tasks";
import type { RoomExtra } from "Room";
import { CreepRole, CreepRoleBase } from "./Role";
import { Dictionary, groupBy, mapValues, min } from "lodash";
import { GetMinerPositions, MakeBody } from "utils/Collections";

export class Miner extends CreepRoleBase implements CreepRole {
  readonly groupName = "Miners";
  override readonly name: string = "Miner";
  override readonly tier: number = 1;

  IsSpawnNeeded(_room: RoomExtra): boolean { return true; }

  GetNewCreepBody(room: RoomExtra): BodyPartConstant[] {
    const t1 = MakeBody(
      [MOVE, 1],
      [WORK, 4],
      [CARRY, 1],
    );
    const t2 = MakeBody(
      [MOVE, 3],
      [WORK, 5],
      [CARRY, 3],
    );

    if (room.energyCapacityAvailable >= CreepExtra.BodyCost(t2))
      return t2;

    return t1;
  }

  override GetRoomQuota(room: RoomExtra) { return GetMinerPositions(room).length + 1; }
  GetGlobalQuota(): number { return -1; }

  SelectNextTask(creep: CreepExtra, room: RoomExtra): CreepTask {
    const sourceId = this.LocateSource(creep, room);
    return sourceId ? new Mine(sourceId) : new Idle();
  }

  CountAssignedPerSource(room: RoomExtra): Dictionary<number> {
    const miningTasks = room.GetAssignedTasks().filter(t => t.action === TaskAction.Mine);
    return mapValues(groupBy(miningTasks, t => (t as Mine).target), c => c.length);
  }

  LocateSource(creep: CreepExtra, room: RoomExtra): Id<Source> | undefined {
    const groups = this.CountAssignedPerSource(room);
    // this.log.info(`minersBySource: ${JSON.stringify(groups)}`, { "<creep>": creep, "<room>": room });
    return room.Sources
      .map(source => ({ source, count: groups[source.id] ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .pop()?.source.id;
  }

  OnSpawnScheduled(room: RoomExtra, name: string): void {
    const sourcesByTaskCount = this.CountAssignedPerSource(room);
    var mostAssigned = "";
    var mostAssignedNumber = 0;
    for (const t in sourcesByTaskCount) {
      if (sourcesByTaskCount[t] > mostAssignedNumber) {
        mostAssignedNumber = sourcesByTaskCount[t];
        mostAssigned = t as Id<Source>;
      }
    }
    if (mostAssigned.length > 0) {
      // Pick the oldest miner from the most assigned source
      const miner = this.GetRoomCreepsInRole(room)
        .filter(c => c.currentTask instanceof Mine && (c.currentTask as Mine).target === mostAssigned)
        .sort((b, a) => (a.ticksToLive ?? CREEP_LIFE_TIME) - (b.ticksToLive ?? CREEP_LIFE_TIME))
        .pop();
      // Unassign them
      if (miner) miner.memory.jobMemory = {};
    }
  }

  TickCreep(creep: CreepExtra, room: RoomExtra): void {
    this.TransferToNeighbours(creep, room);
  }

  TransferToNeighbours(creep: CreepExtra, room: RoomExtra): void {
    type EnergyCarrier = CreepExtra | AnyStoreStructure;
    const closeNeedsEnergy = creep.pos.findInRange(
      [
        ...(room.AssignedCreepsByRoleName.get("Worker") ?? []),
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
