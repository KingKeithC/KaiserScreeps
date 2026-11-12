import { CreepExtra } from 'Creep';
import { RESOURCE_NON_ENERGY as RESOURCES_NON_ENERGY } from 'Data';
import { sum } from 'lodash';
import { RoomExtra } from 'Room';
import { Mine } from 'tasks';
import { CreepTask } from 'tasks/types';
import { Filters, Sorts, MakeBody, SerializeRoomPosition } from 'utils/Collections';
import { TryCollectFrom, TryTransferTo } from 'utils/CreepUtils';
import { CreepRole, CreepRoleBase } from './Role';

export class Miner extends CreepRoleBase implements CreepRole {
  readonly groupName = 'Miners';
  override readonly roleName: string = 'Miner';
  readonly priority = 5;

  IsSpawnNeeded(room: RoomExtra): boolean {
    // We can't spawn miners until we have a worker.
    return room.GetAssignedCreepsOfRole('Worker').length > 0;
  }

  PotentialBodies = [
    MakeBody([CARRY, 1], [WORK, 7], [MOVE, 4]), // 950, containers.
    // MakeBody([CARRY, 9], [WORK, 5], [MOVE, 7]), // 1300, no containers.
    MakeBody([CARRY, 1], [WORK, 5], [MOVE, 3]), // 800, containers
    // MakeBody([CARRY, 7], [WORK, 3], [MOVE, 3]), // 800, no containers
  ];

  GetNewCreepBody(room: RoomExtra): BodyPartConstant[] {
    return this.GetFirstAvailableBodyWithZygote(this.PotentialBodies, room, MakeBody([CARRY, 2], [WORK, 1], [MOVE, 2]));
  }

  override GetMinQuota(room: RoomExtra) {
    return room.ClaimedSources.length;
  }

  SelectNextTask(creep: CreepExtra): CreepTask | null {
    return Mine.forMiner(creep.AssignedRoom, creep);
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
    if (TryCollectFrom(creep, creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1))) return;

    const nearbyContainers = creep.pos.findInRange(FIND_STRUCTURES, 1).filter(Filters.StructureContainer);
    if (TryTransferTo(creep, nearbyContainers, RESOURCES_NON_ENERGY)) return;

    const nearbyTowers = creep.pos.findInRange(FIND_MY_STRUCTURES, 1).filter(Filters.StructureTower);
    const nearbyLinks = creep.AssignedRoom.LinkSenders.filter(link => link.pos.isNearTo(creep));
    const nearbyEnergyDemand =
      sum(nearbyTowers.map(tower => tower.store.getFreeCapacity(RESOURCE_ENERGY))) +
      sum(nearbyLinks.map(link => link.store.getFreeCapacity(RESOURCE_ENERGY)));
    if (TryCollectFrom(creep, nearbyContainers, nearbyEnergyDemand * 2, [RESOURCE_ENERGY])) return;
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

    // If there are construction sites nearby, try to build them before idling
    for (const construction of creep.pos
      .findInRange(FIND_MY_CONSTRUCTION_SITES, 3)
      .sort(Sorts.ConstructionProgressRatioAsc))
      if (creep.build(construction) === OK) return;
  }
}
