import { CreepExtra } from 'Creep';
import { RoomExtra } from 'Room';
import { Mine } from 'tasks';
import { CreepTask } from 'tasks/types';
import { MakeBody } from 'utils/Collections';
import { BodyCost } from 'utils/CreepUtils';
import { CreepRole, CreepRoleBase } from './Role';

export class Miner extends CreepRoleBase implements CreepRole {
  readonly groupName = 'Miners';
  override readonly roleName: string = 'Miner';
  readonly priority = 5;

  IsSpawnNeeded(room: RoomExtra): boolean {
    if (!this.IsRoleUnderQuota(room)) return false;
    // We can't spawn miners until we have a worker.
    return room.AssignedCreeps.filter(c => c.role.groupName === 'Workers').length > 0;
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

    for (const t of tiers) if (BodyCost(t) <= room.energyCapacityAvailable) return t; // Return the first body we can afford

    return MakeBody([CARRY, 2], [WORK, 1], [MOVE, 2]); // 300, Zygote
  }

  override GetMinQuota(room: RoomExtra) {
    return room.ClaimedSources.length;
  }

  SelectNextTask(creep: CreepExtra): CreepTask | null {
    for (const mp of creep.AssignedRoom.AvailableMiningPositions()) return new Mine(mp);
    for (const mp of creep.AssignedRoom.UnfilledMiningPositions()) return new Mine(mp);
    // this.log.warn('No suitable mining position found.', { '<creep>': creep });
    return null;
  }

  TickCreep(creep: CreepExtra): void {
    const nearbyContainers = creep.pos
      .findInRange(FIND_STRUCTURES, 1)
      .filter((structure): structure is StructureContainer => structure.structureType === STRUCTURE_CONTAINER);
    const nearbyTowers = creep.pos
      .findInRange(FIND_MY_STRUCTURES, 1)
      .filter((structure): structure is StructureTower => structure.structureType === STRUCTURE_TOWER);
    const nearbyLinks = creep.AssignedRoom.LinkSenders.filter(link => link.pos.isNearTo(creep));
    const nearbyEnergyDemand =
      nearbyTowers.some(tower => tower.store.getFreeCapacity(RESOURCE_ENERGY) > 0) ||
      nearbyLinks.some(link => link.store.getFreeCapacity(RESOURCE_ENERGY) > 0);

    if (this.TryCollectFromContainer(creep, nearbyContainers, nearbyEnergyDemand)) return;
    if (this.TryPickupDroppedEnergy(creep)) return;
    if (this.TryTransferEnergy(creep, nearbyTowers, 50)) return;
    if (this.TryTransferEnergy(creep, nearbyLinks, 0)) return;
    if (this.TryTransferEnergy(creep, nearbyContainers, 0)) return;
  }

  private TryCollectFromContainer(
    creep: Creep,
    containers: StructureContainer[],
    nearbyEnergyDemand: boolean,
  ): boolean {
    if (!nearbyEnergyDemand || creep.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) return false;

    for (const container of containers)
      if (container.store.getUsedCapacity(RESOURCE_ENERGY) > 0 && creep.withdraw(container, RESOURCE_ENERGY) === OK)
        return true;

    return false;
  }

  private TryPickupDroppedEnergy(creep: Creep): boolean {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) return false;

    const droppedEnergy = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
      filter: resource => resource.resourceType === RESOURCE_ENERGY,
    });
    for (const resource of droppedEnergy) if (creep.pickup(resource) === OK) return true;

    return false;
  }

  private TryTransferEnergy<T extends AnyStoreStructure>(
    creep: Creep,
    targets: T[],
    minimumFreeCapacity: number,
  ): boolean {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) <= 0) return false;

    for (const target of targets)
      if (
        target.store.getFreeCapacity(RESOURCE_ENERGY) > minimumFreeCapacity &&
        creep.transfer(target, RESOURCE_ENERGY) === OK
      )
        return true;

    return false;
  }
}
