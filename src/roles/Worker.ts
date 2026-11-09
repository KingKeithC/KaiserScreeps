import { CreepExtra } from 'Creep';
import { some, sum } from 'lodash';
import { RoomExtra } from 'Room';

import { Build, Mine, Repair, Transfer, UpgradeController } from 'tasks';
import { Retire } from 'tasks/Retire';
import { CreepTask } from 'tasks/types';
import { Filters, GetValueByName, MakeBody } from 'utils/Collections';
import {
  BodyCost,
  TryCollectFromContainer as TryCollectFromContainers,
  TryCollectFromTombs,
  TryPickupDropped,
} from 'utils/CreepUtils';
import { FirstBodyByEnergyCapacity } from 'utils/RoomUtils';
import { CreatePendingRepairs, FindHighestPriorityRepairGroup } from 'utils/RepairUtils';
import { CreepRoleBase, CreepRole } from './Role';

export class Worker extends CreepRoleBase implements CreepRole {
  readonly priority: number = 10;
  readonly groupName = 'Workers';
  readonly roleName: string = 'Worker';

  PossibleBodies = [
    MakeBody([WORK, 10], [CARRY, 7], [MOVE, 9]), // 1800
    MakeBody([WORK, 6], [CARRY, 7], [MOVE, 7]), // 1300
    MakeBody([WORK, 2], [CARRY, 4], [MOVE, 3]), // 550
  ];

  GetNewCreepBody(room: RoomExtra): BodyPartConstant[] {
    const zygote = MakeBody([CARRY, 2], [WORK, 1], [MOVE, 2]); // 300
    // If we haven't spawned a worker in a long time, then default to a zygote
    // This should help prevent death spirals...
    if (Game.time - room.LastSpawnTick(this.roleName) > 1000) return zygote;
    const body = FirstBodyByEnergyCapacity(room, ...this.PossibleBodies, zygote);
    if (body) return body;
    else return zygote;
  }

  TickCreep(creep: CreepExtra): void {
    const containers = creep.pos.findInRange(FIND_STRUCTURES, 1).filter(Filters.StructureContainer);
    if (TryCollectFromContainers(creep, containers, creep.store.getFreeCapacity())) return;
    if (TryPickupDropped(creep)) return;
    if (TryCollectFromTombs(creep)) return;
  }

  GetMinQuota() {
    return 1;
  }

  GetMaxQuota(room: RoomExtra) {
    return room.ClaimedSources.length * 2;
  }

  GrowAmount = 1;
  GrowQuotaWhenEnergyAbove = 3000;

  ShrinkAmount = 1;
  ShrinkQuotaWhenEnergyBelow = 1000;

  rollingAvgEnergyInSources: { [roomName: Room['name']]: number } = {};
  private energySamplesByRoom: { [roomName: Room['name']]: number } = {};

  RoomTickStart(room: RoomExtra): void {
    // Dont count storage in the energy calculation, only sources and workers' carried energy.
    const sourceEnergy = sum(
      room.colony.Logistics.Sources(room.WorkableAreaRoomNames, RESOURCE_ENERGY).map(source => source[1]),
    );
    const workerEnergy = sum(
      room.GetAssignedCreepsOfRole('Worker').map(creep => creep.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0),
    );
    const energyInSources = sourceEnergy + workerEnergy;
    const sampleCount = GetValueByName(this.energySamplesByRoom, room, () => 0) + 1;
    const previousAverage = GetValueByName(this.rollingAvgEnergyInSources, room, () => 0);

    this.rollingAvgEnergyInSources[room.name] = previousAverage + (energyInSources - previousAverage) / sampleCount;
    this.energySamplesByRoom[room.name] = sampleCount;
  }

  GetQuotaChange(room: RoomExtra): number {
    const energyInSources = GetValueByName(this.rollingAvgEnergyInSources, room, () => 0);
    this.log.info('Rolling Average Energy In Sources', {
      room: room.name,
      energyInSources,
      sampleCount: GetValueByName(this.energySamplesByRoom, room, () => 0),
    });
    this.rollingAvgEnergyInSources[room.name] = 0;
    this.energySamplesByRoom[room.name] = 0;
    if (energyInSources > this.GrowQuotaWhenEnergyAbove) return this.GrowAmount;
    // Shrinking is only done by idle workers
    // if (energyInSources < this.ShrinkQuotaWhenEnergyBelow) return -this.ShrinkAmount;
    return 0;
  }

  IsSpawnNeeded(room: RoomExtra) {
    return this.IsRoleUnderQuota(room);
  }

  MaintainAssignedRoom(creep: CreepExtra): CreepTask | null {
    // Main task is to prevent the controller from downgrading
    const maintain = UpgradeController.maintain(creep);
    if (maintain) return maintain;

    // Secondary task is to resupply the spawns/extensions
    const spawnSupply = Transfer.supply(creep, creep.AssignedRoom.SpawnsOrExtensions);
    if (spawnSupply) return spawnSupply;

    // Or refill towers needing energy that aren't next to a miner
    const towers = creep.AssignedRoom.find(FIND_MY_STRUCTURES, {
      filter: (st): st is StructureTower =>
        Filters.StructureTower(st) &&
        st.isActive() &&
        !(st.pos.findInRange(creep.AssignedRoom.GetAssignedCreepsOfRoleGroup('Miners') ?? [], 1).length > 0),
    });
    const towerSupply = Transfer.supply(
      creep,
      towers.filter(st => st.store.getFreeCapacity(RESOURCE_ENERGY) >= 100),
    );
    if (towerSupply) return towerSupply;

    // Or refill the terminal with a base amount of energy
    const terminal = creep.AssignedRoom.terminal;
    if (terminal && terminal.isActive() && terminal.store.getUsedCapacity(RESOURCE_ENERGY) <= 20_000)
      return new Transfer(terminal);

    // Or refill lab energy
    const labs: StructureLab[] = creep.AssignedRoom.find(FIND_MY_STRUCTURES, {
      filter: s => Filters.StructureLab(s) && s.isActive() && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    });
    for (const lab of labs) return new Transfer(lab);

    // Or do construction
    const construction = Build.nearestPriority(creep, creep.AssignedRoom.find(FIND_MY_CONSTRUCTION_SITES));
    if (construction) return construction;

    // Or do repairs if there are no towers
    if (towers.length === 0) {
      const repair = creep.AssignedRoom.PendingRepairGroup;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (repair && repair.repairs.length >= 1) return new Repair(repair.repairs.pop()!);
    }

    return null;
  }

  private deathLockoutTimes: { [roomName: Room['name']]: number } = {};

  DeathLockoutDuration = 100;
  WorkersMineBelowMinerBodyTotalCost = 1000;
  DesiredStorageTasks = 2;
  RetireEnabled = true;
  RetireWhenIdleFor = 30;
  SelectNextTask(creep: CreepExtra): CreepTask | null {
    const storage = creep.AssignedRoom.storage;
    const storageLow =
      storage !== undefined &&
      storage.store.getUsedCapacity(RESOURCE_ENERGY) < creep.AssignedRoom.StorageWartimeEnergyBuffer;
    const maintainers = creep.AssignedRoom.GetAssignedCreepsOfRole('Maintainer');
    const creepEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const creepHasNonEnergy = creep.store.getUsedCapacity() - creepEnergy > 0;

    // ------ SUPPLY ------
    if (storage && (creepHasNonEnergy || (creepEnergy > 0 && storageLow))) {
      // Need to store resources
      const store = Transfer.stash(creep, storage);
      if (store) return store;
    }

    if (creepEnergy > 0) {
      // Need to spend hauled energy

      // Look for a spending task amongst typical targets, unless we are short on maintainers
      const spend =
        maintainers.length === 0
          ? this.MaintainAssignedRoom(creep)
          : this.WorkerSpendingTask(creep, undefined, maintainers.length);
      if (spend) return spend;

      if ((creep.AssignedRoom.controller?.level ?? 0) < 6) {
        // Leftover goes to controller upgrade
        const upgrade = UpgradeController.upgrade(creep);
        if (upgrade) return upgrade;
      } else {
        // Or storage if we are RCL 6 or above
        if (storage !== undefined && storage.store.getFreeCapacity() > 0) return new Transfer(storage);
      }
    }

    // ------ GATHER ------
    if (creep.store.getUsedCapacity() === 0) {
      // Try to find a gathering task, for any energy from storage or locally if we are low on maintainers,
      // otherwise for general resources, which only make sense with storage to stash them in
      const gather =
        maintainers.length === 0
          ? (Transfer.fromStorage(creep.AssignedRoom) ?? Transfer.collect(creep, [RESOURCE_ENERGY]))
          : Transfer.collect(creep, storage ? RESOURCES_ALL : [RESOURCE_ENERGY], { minAmount: 50 });
      if (gather) return gather;

      // If there aren't enough miners, then do mining
      if (
        sum([...creep.AssignedRoom.AssignedTasksWithCreep(Mine)], m => BodyCost(m[0].body)) <
        this.WorkersMineBelowMinerBodyTotalCost
      )
        return Mine.anyUnfilled(creep.AssignedRoom);
    }

    // Didn't need or Can't find, gathering or spending task

    // Log a warning if we found nothing to do
    // Ignore the warning if all the sources are out of energy, as
    // that can cause it to spam when everything is running at peak efficiency
    if (
      some(
        creep.AssignedRoom.FlatMapOverRoomsInClaimedArea(r =>
          r instanceof Room ? [r.find(FIND_SOURCES_ACTIVE).length > 0] : [false],
        ),
      )
    ) {
      this.log.warn('No task is available despite active energy sources.', {
        '<creep>': creep,
        idle: creep.LifetimeIdle,
      });
      const retire = this.ConsiderRetirement(creep);
      if (retire) {
        // We must be overspawned, so lower the quota
        if (
          Game.time - GetValueByName(this.deathLockoutTimes, creep.AssignedRoom, () => 0) >
          this.DeathLockoutDuration
        ) {
          this.ChangeQuota(creep.AssignedRoom, -this.ShrinkAmount, false);
          this.deathLockoutTimes[creep.AssignedRoom.name] = Game.time;
        }
        return retire;
      }
    }
    return null;
  }

  ConsiderRetirement(creep: CreepExtra): Retire | null {
    const spawn = creep.AssignedRoom.SpawnsOrExtensions.filter(Filters.StructureSpawn).pop();
    if (spawn && this.RetireEnabled && creep.LifetimeIdle > this.RetireWhenIdleFor) return new Retire(spawn);
    return null;
  }

  MaxSupplyForTowers = 1;
  MaxUpgradePerRoom = 2;
  public WorkerSpendingTask(
    creep: CreepExtra,
    supplyTasks?: Transfer[],
    maintainers = creep.AssignedRoom.GetAssignedCreepsOfRole('Maintainer').length,
  ): CreepTask | null {
    if (maintainers === 0) {
      const spawnSupply = Transfer.supply(creep, creep.AssignedRoom.SpawnsOrExtensions, supplyTasks);
      if (spawnSupply) return spawnSupply;
    }

    const upgrade = UpgradeController.upgrade(creep);
    if (upgrade && maintainers === 0) return upgrade;

    if ((creep.AssignedRoom.controller?.level ?? 0) >= 3) {
      const repair = this.NearestRepair(creep);
      if (repair) return repair;
    }

    const construction = Build.nearestPriority(
      creep,
      creep.AssignedRoom.FlatMapOverRoomsInClaimedArea(r =>
        r instanceof Room ? r.find(FIND_MY_CONSTRUCTION_SITES) : [],
      ),
    );
    if (construction) return construction;

    return null;
  }

  // Closest repair across claimed rooms that have no towers to do the repairing.
  private NearestRepair(creep: CreepExtra): Repair | null {
    for (const [room] of creep.AssignedRoom.MapWithRoomsInClaimedArea<RoomExtra | Room | string>(r => r)) {
      if (typeof room === 'string') continue;
      if (room.find(FIND_MY_STRUCTURES, { filter: Filters.StructureTower }).length > 0) continue;

      const group =
        room instanceof RoomExtra
          ? room.PendingRepairGroup
          : FindHighestPriorityRepairGroup(room, CreatePendingRepairs(room));
      if (!group) continue;

      const repair = Repair.nearestInGroup(creep, group);
      if (repair) return repair;
    }
    return null;
  }
}
