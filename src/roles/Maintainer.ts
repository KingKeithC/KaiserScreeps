import { CreepExtra } from 'Creep';
import { RoomExtra } from 'Room';
import { MAX_TRANSFER_QUANTITY, Mine, Transfer } from 'tasks';
import { CreepTask } from 'tasks/types';
import { Filters } from 'utils/Collections';
import { CreepRole } from './Role';
import { Worker } from './Worker';

export class Maintainer extends Worker implements CreepRole {
  override readonly priority = 1;
  override roleName = 'Maintainer';

  override GetMinQuota(): number {
    return 1;
  }

  override GetMaxQuota(): number {
    return 2;
  }

  protected override RoleQuotaChangeFrequency = 100;
  protected ReplaceMaintainerBelowTTL = 200;

  /**
   * Raise the quota from if it is below 1, or if the one maintainer we have is close to retirement.
   *
   * Lower the quota if there is more than one maintainer.
   *
   * Otherwise, maintain the current quota.
   */
  override GetQuotaChange(room: RoomExtra): number {
    const idealQuota = 1;
    const maintainers = this.GetRoomCreepsInRole(room);
    if (maintainers.length < idealQuota) return this.GrowAmount;
    if (maintainers.length > idealQuota) return -this.ShrinkAmount;
    const loneMaintainer = maintainers.pop();
    return loneMaintainer !== undefined &&
      loneMaintainer.ticksToLive !== undefined &&
      loneMaintainer.ticksToLive < this.ReplaceMaintainerBelowTTL
      ? this.GrowAmount
      : 0;
  }

  SelectNextTask(creep: CreepExtra): CreepTask | null {
    return this.DoWithLocalEnergy(creep, c => this.MaintainAssignedRoom(c));
  }

  TickCreep(creep: CreepExtra): void {
    // If we have energy, and there are spawns/extensions next
    // to us that need energy, give our energy to them
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      for (const s of creep.pos.findInRange(FIND_MY_STRUCTURES, 1, { filter: Filters.StructureSpawnOrExtension }))
        if (s.store.getFreeCapacity(RESOURCE_ENERGY) > 0) creep.transfer(s, RESOURCE_ENERGY);

    // Otherwise, if we are near a link receiver, that has
    // energy, and we have space, withdraw energy from it.
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
      for (const l of creep.AssignedRoom.LinkReceivers)
        if (l.store.getUsedCapacity(RESOURCE_ENERGY) > 0 && creep.pos.isNearTo(l)) creep.withdraw(l, RESOURCE_ENERGY);
  }

  /**
   * Control loop for Maintainers.
   *
   * Gather energy from the creep's assigned room and execute the task
   * returned by `findMainSpendingTask`.
   *
   * Only gathers energy sources from the Assigned room, containing 100 or more.
   * Gathers from storage when none can be found otherwise.
   *
   * If no main spending task was found, then excess held energy is stored.
   *
   * @param creep The creep to perform the actions.
   * @param findMainSpendingTask A callback on the creep that returns a task to spend the energy on.
   * @returns The next task for the creep to perform as part of the loop.
   */
  DoWithLocalEnergy(creep: CreepExtra, findMainSpendingTask: (c: CreepExtra) => CreepTask | null): CreepTask | null {
    if (creep.HasEnergy) {
      // Get main spending task
      const mainTask = findMainSpendingTask(creep);
      if (mainTask) return mainTask;

      // Excess goes into storage
      if (creep.AssignedRoom.storage !== undefined) return new Transfer(creep.AssignedRoom.storage);
    }

    if (creep.IsEmpty) {
      // Prioritize collecting from a link
      const link = creep.AssignedRoom.LinkReceivers.pop();
      if (link && link.store.getUsedCapacity(RESOURCE_ENERGY) > 0)
        return new Transfer(link, [RESOURCE_ENERGY, -MAX_TRANSFER_QUANTITY]);

      // Collect energy from sources in the same room
      const mainSource = Transfer.supply(creep, { collect: [RESOURCE_ENERGY], sameRoom: true });
      if (mainSource) return mainSource;

      // If no source found, collect from storage
      if (
        creep.AssignedRoom.storage !== undefined &&
        creep.AssignedRoom.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0
      )
        return new Transfer(creep.AssignedRoom.storage, [RESOURCE_ENERGY, -MAX_TRANSFER_QUANTITY]);

      // If storage is empty, do mining
      // If there aren't enough miners, then do mining
      const mine = Mine.anyUnfilled(creep.AssignedRoom, creep.AssignedRoom.Mines);
      if (mine) return mine;
    }

    return null;
  }
}
