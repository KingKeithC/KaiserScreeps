import { CreepExtra } from 'Creep';
import { RESOURCE_NON_ENERGY } from 'Data';
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
    return 1;
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
    return (room.controller?.level ?? 0) > 3 && room.storage !== undefined;
  }

  SelectNextTask(creep: CreepExtra): CreepTask | null {
    const storeTask = Transfer.stash(creep);

    // Store any non-energy resources first
    if (creep.HasNonEnergy && storeTask) return storeTask;

    // If the creep has energy, try to deliver it to various structures in order of priority.
    if (creep.HasEnergy) {
      // Resupply the spawns/extensions
      const spawnSupply = Transfer.supply(creep, creep.AssignedRoom.SpawnsOrExtensions);
      if (spawnSupply) return spawnSupply;

      // Or refill towers needing energy that aren't next to a miner
      const tower = this.TowerNotNearMinersAndNeedingEnergy(creep);
      if (tower) return tower;

      // Or refill the terminal with a base amount of energy
      const terminal = creep.AssignedRoom.terminal;
      if (terminal && terminal.isActive() && terminal.store.getUsedCapacity(RESOURCE_ENERGY) <= 20_000)
        return new Transfer(terminal);

      // Or refill lab energy
      const labs: StructureLab[] = creep.AssignedRoom.find(FIND_MY_STRUCTURES, {
        filter: s => Filters.StructureLab(s) && s.isActive() && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
      });
      for (const lab of labs) return new Transfer(lab);

      // Leftover energy or resources can be stored
      if (storeTask) return storeTask;
    }

    // If the creep is empty, try to gather resources from the environment.
    if (creep.IsEmpty) {
      // If the creep is empty, try to gather resources from the environment.
      let gather = Transfer.supply(creep, {
        collect: [RESOURCE_ENERGY],
        minAmount: creep.FreeCapacity(),
        sameRoom: true,
      });
      gather ??= Transfer.fromStorage(creep.AssignedRoom, 0);
      gather ??= Transfer.supply(creep, { collect: RESOURCE_NON_ENERGY });
      if (gather) return gather;
    }

    return null;
  }

  TickCreep(creep: CreepExtra): void {
    this.AmbientWorkerTransfers(creep);
  }
}
