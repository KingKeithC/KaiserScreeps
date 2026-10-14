import { CreepExtra } from "Creep";
import { CreepTask, Idle, Mine, TaskAction } from "tasks";
import type { RoomExtra } from "Room";
import { CreepRole, CreepRoleBase } from "./Role";
import { Dictionary, groupBy, mapValues, min } from "lodash";
import { GetMinerPositions, MakeBody } from "utils/Collections";

export class Miner extends CreepRoleBase implements CreepRole {
  readonly groupName = "Miners";
  override readonly name: string = "Miner";
  override readonly tier: number = 1;

  IsSpawnNeeded(room: RoomExtra): boolean { return room.GetUnfilledMiningPositions().length > 0; }

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

  override GetRoomQuota(room: RoomExtra) { return room.MinerPositions.length; }
  GetGlobalQuota(): number { return -1; }

  SelectNextTask(creep: CreepExtra, room: RoomExtra): CreepTask | null {
    const unfilled = room.GetUnfilledUnassignedMiningPositions().pop();
    if (unfilled) {
      this.log.info(`Filling Miner Position: ${unfilled}`, { "<creep>": creep, "<room>": room });
      return new Mine(unfilled);
    }
    this.log.info("No unfilled mining position found!", { "<creep>": creep, "<room>": room });
    return null;
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
