import { CreepExtra } from "Creep";
import { RoomExtra } from "Room";
import { CreepTask, Mine } from "tasks";
import { MakeBody } from "utils/Collections";
import { BodyCost } from "utils/CreepUtils";
import { MiningPosition } from "utils/RoomUtils";
import { CreepRoleBase, CreepRole } from "./Role";


export class Miner extends CreepRoleBase implements CreepRole {
  readonly groupName = "Miners";
  override readonly name: string = "Miner";
  override readonly tier: number = 1;

  IsSpawnNeeded(room: RoomExtra): boolean { return room.GetUnassignedMiningPositions().length > 0; }

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

    if (room.energyCapacityAvailable >= BodyCost(t2))
      return t2;

    return t1;
  }

  override GetRoomQuota(room: RoomExtra) { return room.MinerPositions.length; }
  GetGlobalQuota(): number { return -1; }

  GetInitialTask(room: RoomExtra): CreepTask | null {
    const unassigned = room.GetUnassignedMiningPositions().pop();
    if (unassigned !== undefined) return new Mine(unassigned);
    return null;
  }

  TickCreep(creep: CreepExtra): void {
    this.TransferToNeighbours(creep);
  }

  TransferToNeighbours(creep: CreepExtra): void {
    type EnergyCarrier = CreepExtra | AnyStoreStructure;
    const closeNeedsEnergy = creep.pos.findInRange(
      [
        ...(creep.AssignedRoom.AssignedCreepsByRoleName.get("Worker") ?? []),
        ...(creep.AssignedRoom.AssignedCreepsByRoleName.get("Settler") ?? []),
        ...creep.AssignedRoom.Containers,
        ...creep.AssignedRoom.LinkSenders,
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
