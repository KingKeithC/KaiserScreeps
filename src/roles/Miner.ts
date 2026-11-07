import { CreepExtra } from 'Creep';
import { RoomExtra } from 'Room';
import { Mine } from 'tasks';
import { CreepTask } from 'tasks/types';
import { Sorts, MakeBody } from 'utils/Collections';
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
    for (const mp of creep.AssignedRoom.AvailableMiningPositions()) return new Mine(mp.source, mp.pos);
    for (const mp of creep.AssignedRoom.UnfilledMiningPositions()) return new Mine(mp.source, mp.pos);
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
      nearbyTowers.reduce((total, tower) => total + tower.store.getFreeCapacity(RESOURCE_ENERGY), 0) +
      nearbyLinks.reduce((total, link) => total + link.store.getFreeCapacity(RESOURCE_ENERGY), 0);
    const notEnergy = RESOURCES_ALL.filter(rt => rt !== RESOURCE_ENERGY);

    if (this.TryCollectFromContainer(creep, nearbyContainers, nearbyEnergyDemand * 2, [RESOURCE_ENERGY])) return;
    if (this.TryPickupDropped(creep)) return;
    if (this.TryTransfer(creep, nearbyContainers, notEnergy)) return;
    if (this.TryTransfer(creep, nearbyTowers, [RESOURCE_ENERGY])) return;
    if (this.TryTransfer(creep, nearbyLinks, [RESOURCE_ENERGY])) return;
    if (this.TryTransfer(creep, nearbyContainers, [RESOURCE_ENERGY])) return;

    if (!(creep.currentTask instanceof Mine && creep.currentTask.target instanceof Source)) return;
    if (creep.currentTask.target.energy > 0) return;

    // Source is out of energy, so can't mine, repair whatever is around us
    for (const repair of creep.pos
      .findInRange(FIND_STRUCTURES, 3, {
        filter: s => s.hits < s.hitsMax && ![STRUCTURE_WALL, STRUCTURE_RAMPART].some(v => s.structureType === v),
      })
      .sort(Sorts.StructureHitsRatioAsc))
      if (creep.repair(repair) === OK) return;
  }

  private TryCollectFromContainer(
    creep: Creep,
    containers: StructureContainer[],
    collectionLimit?: number,
    resources: ResourceConstant[] = RESOURCES_ALL,
  ): boolean {
    for (const rt of resources) {
      if (collectionLimit && collectionLimit <= 0) continue;
      for (const container of containers)
        if ((container.store.getUsedCapacity(rt) ?? 0) > 0 && creep.withdraw(container, rt, collectionLimit) === OK)
          return true;
    }
    return false;
  }

  private TryPickupDropped(
    creep: Creep,
    resources: ResourceConstant[] = RESOURCES_ALL,
    collectionLimit: number = creep.store.getFreeCapacity(),
  ): boolean {
    for (const rt of resources) {
      const amountToCollect = Math.min(collectionLimit, creep.store.getFreeCapacity(rt));
      if (amountToCollect <= 0) continue;

      for (const d of creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
        filter: resource => resource.resourceType === rt,
      }))
        if (d.amount <= amountToCollect && creep.pickup(d) === OK) return true;
    }

    return false;
  }

  private TryTransfer<T extends AnyStoreStructure>(
    creep: Creep,
    targets: T[],
    resources: ResourceConstant[] = RESOURCES_ALL,
    minimumFreeCapacity = 0,
  ): boolean {
    for (const resource of resources) {
      if (creep.store.getUsedCapacity(resource) <= 0) continue;

      for (const target of targets)
        if (
          (target.store.getFreeCapacity(resource) ?? 0) > minimumFreeCapacity &&
          creep.transfer(target, resource) === OK
        )
          return true;
    }

    return false;
  }
}
