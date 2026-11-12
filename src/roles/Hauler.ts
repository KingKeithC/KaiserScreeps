import { CreepExtra } from 'Creep';
import { RoomExtra } from 'Room';
import { Transfer } from 'tasks/Transfer';
import { CreepTask } from 'tasks/types';
import { Filters, MakeBody } from 'utils/Collections';
import { CreepRole, CreepRoleBase } from './Role';

export class Hauler extends CreepRoleBase implements CreepRole {
  override roleName = 'Hauler';
  override groupName = 'Workers';
  override priority = 12;

  GetMinQuota() {
    return 2;
  }

  PossibleBodies = [
    MakeBody([MOVE, 15], [CARRY, 30]), // 2250, RCL6
    MakeBody([MOVE, 12], [CARRY, 24]), // 1800, RCL5
    MakeBody([MOVE, 9], [CARRY, 17]), // 1300, RCL4
  ];

  GetNewCreepBody(room: RoomExtra): BodyPartConstant[] {
    return this.GetFirstAvailableBodyWithZygote(
      this.PossibleBodies,
      room,
      this.PossibleBodies[this.PossibleBodies.length - 1],
    );
  }

  IsSpawnNeeded(room: RoomExtra): boolean {
    return (room.controller?.level ?? 0) > 3;
  }

  SelectNextTask(creep: CreepExtra): CreepTask | null {
    if (creep.IsEmpty) {
      // If the creep is empty, try to gather resources from the environment.
      let gather = Transfer.supply(creep, { collect: RESOURCES_ALL, minAmount: 200 });
      gather ??= Transfer.supply(creep, { collect: RESOURCES_ALL, minAmount: 100 });
      gather ??= Transfer.supply(creep, { collect: RESOURCES_ALL });
      if (gather) return gather;
    }

    if (creep.HasEnergy) {
      // Supply workers first
      const workers = creep.AssignedRoom.GetAssignedCreepsOfRole('Worker');
      const workerNeedingEnergy = Transfer.supply(creep, workers);
      if (workerNeedingEnergy) return workerNeedingEnergy;

      // Then refill the terminal with a base amount of energy
      const terminal = creep.AssignedRoom.terminal;
      if (terminal && terminal.isActive() && terminal.store.getUsedCapacity(RESOURCE_ENERGY) <= 20_000)
        return new Transfer(terminal);

      // Or refill lab energy
      const labs: StructureLab[] = creep.AssignedRoom.find(FIND_MY_STRUCTURES, { filter: Filters.LabsNeedingEnergy });
      for (const lab of labs) return new Transfer(lab);

      // Or stash excess resources in storage
      if (creep.room.storage) {
        const store = Transfer.stash(creep, creep.room.storage);
        if (store) return store;
      }
    }
    return null;
  }
}
