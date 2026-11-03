import { CreepExtra } from 'Creep';
import { Collect, Supply } from 'tasks';
import { CreepTask } from 'tasks/types';
import { CreepRole } from './Role';
import { Worker } from './Worker';

export class Maintainer extends Worker implements CreepRole {
  override name = 'Maintainer';

  GetRoomQuota(): number {
    return 2;
  }

  SelectNextTask(creep: CreepExtra): CreepTask<string> | null {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      // Main task is to prevent the controller from downgrading
      const maintain = this.MaintainController(creep);
      if (maintain) return maintain;

      // Secondary task is to resupply the spawns/extensions
      const spawnSupply = this.FindSpawnSupply(creep, 0);
      if (spawnSupply) return spawnSupply;

      // Excess goes into storage
      if (creep.AssignedRoom.storage !== undefined) return new Supply(creep.AssignedRoom.storage);
    }

    if (creep.store.getFreeCapacity() > 0) {
      // Collect energy from sources in the same room that have more than 100
      const energySource =
        this.CollectResources(creep, [RESOURCE_ENERGY], true, 100) ?? this.CollectFromRoomStorage(creep);
      if (energySource) return energySource;

      // If no source found, use storage
      if (creep.AssignedRoom.storage !== undefined) return new Collect(creep.AssignedRoom.storage);
    }

    return null;
  }
}
