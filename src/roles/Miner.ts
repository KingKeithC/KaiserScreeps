import { CreepExtra } from "Creep";
import { RoomExtra } from "Room";
import { CreepTask, Mine } from "tasks";
import { MakeBody } from "utils/Collections";
import { BodyCost } from "utils/CreepUtils";
import { CreepRole, CreepRoleBase } from "./Role";


export class Miner extends CreepRoleBase implements CreepRole {
  readonly groupName = "Miners";
  override readonly name: string = "Miner";

  IsSpawnNeeded(room: RoomExtra): boolean {
    // We can't spawn miners until we have at least two workers.
    return (room.AssignedCreepsByRoleName.get("Worker") ?? []).length > 2;
  }

  GetNewCreepBody(room: RoomExtra): BodyPartConstant[] {
    // 5 Work seems to be enough to mine a source to empty on the exact tick it recharges.
    // All miners still need 1 carry to put what they mined into a container.

    const tiers = [
      MakeBody([CARRY, 1], [WORK, 7], [MOVE, 4]), // 950, containers.
      // MakeBody([CARRY, 9], [WORK, 5], [MOVE, 7]), // 1300, no containers.
      MakeBody([CARRY, 1], [WORK, 5], [MOVE, 3]), // 800, containers
      // MakeBody([CARRY, 7], [WORK, 3], [MOVE, 3]), // 800, no containers
    ];

    for (const t of tiers)
      if (BodyCost(t) <= room.energyCapacityAvailable)
        return t; // Return the first body we can afford

    return MakeBody([CARRY, 2], [WORK, 1], [MOVE, 2]); // 300, Zygote
  }

  override GetRoomQuota(room: RoomExtra) { return room.MaxMiners; }

  SelectNextTask(creep: CreepExtra): CreepTask | null {
    for (const mp of creep.AssignedRoom.AvailableMiningPositions())
      return new Mine(mp);
    this.log.warn(`No suitable mining position found.`, { "<creep>": creep });
    return null;
  }

  TickCreep(creep: CreepExtra): void {
    // If we have space for energy, and there is energy below us, pick it up
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
      for (const dropped of creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, { filter: r => r.resourceType === RESOURCE_ENERGY }))
        if (dropped.resourceType === RESOURCE_ENERGY)
          creep.pickup(dropped);

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
        ...creep.pos.findInRange(FIND_STRUCTURES, 1, { filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity(RESOURCE_ENERGY) }),
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
