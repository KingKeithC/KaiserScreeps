import { CreepExtra } from "Creep";
import { unique } from "lodash";
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
    const tiers = [
      MakeBody([CARRY, 9], [WORK, 5], [MOVE, 7]),
      MakeBody([CARRY, 3], [WORK, 5], [MOVE, 3]),
      MakeBody([CARRY, 7], [WORK, 3], [MOVE, 3]),
      MakeBody([CARRY, 1], [WORK, 1], [MOVE, 1]),
    ];

    for (const t of tiers)
      if (BodyCost(t) <= room.energyCapacityAvailable)
        return t; // Return the first body we can afford

    return tiers.pop()!; // Return the last (cheapest) body.
  }

  override GetRoomQuota(room: RoomExtra) { return room.MaxMiners; }
  GetGlobalQuota(): number { return -1; }

  GetInitialTask(room: RoomExtra): CreepTask | null {
    const unassignedSource = room.GetUnassignedMiningPositions().pop();
    if (unassignedSource) return new Mine(unassignedSource);
    this.log.warn(`No suitable mining position found.`);
    return null;
  }

  SelectNextTask(creep: CreepExtra): CreepTask | null {
    return this.GetInitialTask(creep.AssignedRoom);
  }

  TickCreep(creep: CreepExtra): void {
    // If we have space for energy, and there is energy below us, pick it up
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
      for (const dropped of creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, { filter: r => r.resourceType === RESOURCE_ENERGY }))
        if (dropped.resourceType === RESOURCE_ENERGY)
          creep.pickup(dropped);

    // If we are in the remote room, vaccuum up energy in nearby containers
    if (creep.room.name !== creep.AssignedRoom.name)
      this.WithdrawFromContainers(creep);

    // Give away energy we have to consumers
    this.TransferToNeighbours(creep);
  }

  WithdrawFromContainers(creep: CreepExtra): void {
    const nearbyContainer = creep.pos.findInRange(
      FIND_STRUCTURES,
      1,
      { filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0 },
    ).pop();
    if (nearbyContainer) creep.withdraw(nearbyContainer, RESOURCE_ENERGY);
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
