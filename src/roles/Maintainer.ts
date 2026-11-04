import { CreepExtra } from 'Creep';
import { RoomExtra } from 'Room';
import { Collect, Supply } from 'tasks';
import { CreepTask } from 'tasks/types';
import { FirstBodyByEnergyCapacity } from 'utils/RoomUtils';
import { CreepRole } from './Role';
import { Worker } from './Worker';

export class Maintainer extends Worker implements CreepRole {
  override name = 'Maintainer';

  GetRoomQuota(): number {
    return 2;
  }

  /**
   * Maintainers use the same logic as Workers,
   * except without the barebones Zygote or 'emergency' spawn logic.
   */
  override GetNewCreepBody(room: RoomExtra): BodyPartConstant[] {
    return FirstBodyByEnergyCapacity(room, ...this.PossibleBodies) ?? this.PossibleBodies[-1];
  }

  SelectNextTask(creep: CreepExtra): CreepTask<string> | null {
    return this.DoWithLocalEnergy(creep, c => this.MaintainControllerOrSpawn(c));
  }

  MaintainControllerOrSpawn(creep: CreepExtra): CreepTask | null {
    // Main task is to prevent the controller from downgrading
    const maintain = this.MaintainController(creep);
    if (maintain) return maintain;

    // Secondary task is to resupply the spawns/extensions
    const spawnSupply = this.FindSpawnSupply(creep, 0);
    if (spawnSupply) return spawnSupply;

    // Leftover goes to controller upgrade
    const upgrade = this.UpgradeController(creep);
    if (upgrade) return upgrade;

    return null;
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
  DoWithLocalEnergy(
    creep: CreepExtra,
    findMainSpendingTask: (c: CreepExtra) => CreepTask | null,
  ): CreepTask<string> | null {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      // Get main spending task
      const mainTask = findMainSpendingTask(creep);
      if (mainTask) return mainTask;

      // Excess goes into storage
      if (creep.AssignedRoom.storage !== undefined) return new Supply(creep.AssignedRoom.storage);
    }

    if (creep.store.getUsedCapacity() === 0) {
      // Collect energy from sources in the same room that have more than 100
      const mainSource = this.CollectResources(creep, [RESOURCE_ENERGY], true, 100);
      if (mainSource) return mainSource;

      if (
        creep.AssignedRoom.storage !== undefined &&
        creep.AssignedRoom.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0
      )
        // If no source found, use any storage
        return new Collect(creep.AssignedRoom.storage);
      else if (creep.AssignedRoom.GetAssignedCreepsOfRole('Miner').length === 0)
        // If no storage, and no miners, mine
        return this.MineAnyFreePosition(creep);
    }

    return null;
  }
}
