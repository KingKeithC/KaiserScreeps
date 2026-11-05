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

  PickupDropped(creep: CreepExtra): void {
    // If we have space for resources, and there are some around us, pick it up
    if (creep.store.getUsedCapacity() > 0)
      for (const dropped of creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1)) creep.pickup(dropped);
  }

  TickCreep(creep: CreepExtra): void {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const nearLinks = creep.pos.findInRange(FIND_MY_STRUCTURES, 1, {
      filter: { structureType: STRUCTURE_LINK },
    }) as StructureLink[];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const nearContainers = creep.pos.findInRange(FIND_MY_STRUCTURES, 1, {
      filter: { structureType: STRUCTURE_CONTAINER },
    }) as StructureContainer[];

    // If there is a link that needs energy, and
    // a container that has it, and we have room
    for (const link of nearLinks)
      if (link.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
        for (const container of nearContainers)
          if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && container.store.getUsedCapacity(RESOURCE_ENERGY) > 0)
            creep.withdraw(container, RESOURCE_ENERGY);
          else this.TransferToNeighbours(creep, RESOURCE_ENERGY, link);

    this.PickupDropped(creep);
    this.TransferToNeighbours(creep);
  }

  TransferToNeighbours(
    creep: CreepExtra,
    preferredResource?: ResourceConstant,
    preferredDest?: AnyStoreStructure,
  ): void {
    let needSupply: CreepExtra | AnyStoreStructure | undefined = preferredDest;

    const transferResource = (rt: ResourceConstant) => {
      if (needSupply === undefined)
        needSupply = creep.pos
          .findInRange(
            [
              ...creep.AssignedRoom.AssignedCreeps.filter(c => c.role.groupName === 'Worker'),
              ...creep.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: s => ('store' in s && s.store.getFreeCapacity(rt)) ?? 0 > 0,
              }),
              ...creep.AssignedRoom.LinkSenders,
            ] as (CreepExtra | AnyStoreStructure)[],
            1,
            {
              filter: (target): target is CreepExtra | AnyStoreStructure =>
                'store' in target && (target.store.getFreeCapacity(rt) ?? 0) > 0,
            },
          )
          .sort((b, a) => (a.store.getFreeCapacity(rt) ?? 0) - (b.store.getFreeCapacity(rt) ?? 0))
          .pop();
      if (needSupply) creep.transfer(needSupply, rt);
    };

    if (preferredResource) transferResource(preferredResource);
    else {
      for (const [res, amt] of Object.entries(creep.store))
        if ((amt as number) !== null && (amt as number) !== undefined && (amt as number) > 0)
          transferResource(res as ResourceConstant);
    }
  }
}
