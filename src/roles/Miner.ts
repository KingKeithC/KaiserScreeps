import { CreepExtra } from 'Creep';
import { RoomExtra } from 'Room';
import { Mine } from 'tasks';
import { CreepTask } from 'tasks/types';
import { Filters, Sorts, MakeBody, SerializeRoomPosition } from 'utils/Collections';
import { BodyCost, TryCollectFromContainer, TryPickupDropped, TryTransferTo } from 'utils/CreepUtils';
import { CreepRole, CreepRoleBase } from './Role';

export class Miner extends CreepRoleBase implements CreepRole {
  readonly groupName = 'Miners';
  override readonly roleName: string = 'Miner';
  readonly priority = 5;

  IsSpawnNeeded(room: RoomExtra): boolean {
    if (!this.IsRoleUnderQuota(room)) return false;
    // We can't spawn miners until we have a worker.
    return room.AssignedCreeps.filter(Filters.CreepRoleGroupName('Workers')).length > 0;
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
    if (!creep.IsInAssignedMiningPosition()) return; // Don't make us tired

    // Skip ambient actions when we are a miner assigned to a mining task and we are not in position
    if (
      creep.role instanceof Miner &&
      creep.currentTask?.action === Mine.action &&
      (creep.currentTask as Mine).targetPos !== SerializeRoomPosition(creep.pos)
    )
      return;

    const nearbyNonMiners = creep.pos.findInRange(this.colony.MyCreeps, 1, {
      filter: c => c.store.getFreeCapacity() > 0 && !Filters.CreepRoleGroupName('Miners')(c),
    });
    if (TryTransferTo(creep, nearbyNonMiners, [RESOURCE_ENERGY])) return;
    if (TryPickupDropped(creep)) return;

    const nearbyContainers = creep.pos.findInRange(FIND_STRUCTURES, 1).filter(Filters.StructureContainer);
    const notEnergy = RESOURCES_ALL.filter(rt => rt !== RESOURCE_ENERGY);
    if (TryTransferTo(creep, nearbyContainers, notEnergy)) return;

    const nearbyTowers = creep.pos.findInRange(FIND_MY_STRUCTURES, 1).filter(Filters.StructureTower);
    const nearbyLinks = creep.AssignedRoom.LinkSenders.filter(link => link.pos.isNearTo(creep));
    const nearbyEnergyDemand =
      nearbyTowers.reduce((total, tower) => total + tower.store.getFreeCapacity(RESOURCE_ENERGY), 0) +
      nearbyLinks.reduce((total, link) => total + link.store.getFreeCapacity(RESOURCE_ENERGY), 0);
    if (TryCollectFromContainer(creep, nearbyContainers, nearbyEnergyDemand * 2, [RESOURCE_ENERGY])) return;
    if (TryTransferTo(creep, nearbyTowers, [RESOURCE_ENERGY])) return;
    if (TryTransferTo(creep, nearbyLinks, [RESOURCE_ENERGY])) return;
    if (TryTransferTo(creep, nearbyContainers, [RESOURCE_ENERGY])) return;

    if (!(creep.currentTask instanceof Mine && creep.currentTask.target instanceof Source)) return;
    if (creep.currentTask.target.energy > 0) return;

    // Source is out of energy, so can't mine, repair whatever is around us
    for (const repair of creep.pos
      .findInRange(FIND_STRUCTURES, 3, { filter: s => Filters.Damaged(s) && !Filters.StructureWallOrRampart(s) })
      .sort(Sorts.StructureHitsRatioAsc))
      if (creep.repair(repair) === OK) return;
  }
}
