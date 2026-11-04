import { CreepExtra } from 'Creep';
import { sum } from 'lodash';
import { RoomExtra } from 'Room';

import { Build, Collect, Mine, Repair, Supply, UpgradeController } from 'tasks';
import { Retire } from 'tasks/Retire';
import { CreepTask, TaskAction } from 'tasks/types';
import { DeserializeRoomPosition, MakeBody } from 'utils/Collections';
import { BodyCost } from 'utils/CreepUtils';
import { ContainerAndAmount, ResourceContainer, FirstBodyByEnergyCapacity } from 'utils/RoomUtils';
import { CreepRoleBase, CreepRole } from './Role';

export class Worker extends CreepRoleBase implements CreepRole {
  readonly groupName = 'Workers';
  readonly name: string = 'Worker';

  PossibleBodies = [
    MakeBody([WORK, 10], [CARRY, 7], [MOVE, 9]), // 1800
    MakeBody([WORK, 6], [CARRY, 7], [MOVE, 7]), // 1300
    MakeBody([WORK, 2], [CARRY, 4], [MOVE, 3]), // 550
  ];

  GetNewCreepBody(room: RoomExtra): BodyPartConstant[] {
    const zygote = MakeBody([CARRY, 2], [WORK, 1], [MOVE, 2]); // 300
    // If we haven't spawned a worker in a long time, then default to a zygote
    // This should help prevent death spirals...
    if (Game.time - room.LastSpawnTick(this.name) > 1000) return zygote;
    const body = FirstBodyByEnergyCapacity(room, ...this.PossibleBodies, zygote);
    if (body) return body;
    else return zygote;
  }

  TickCreep(creep: CreepExtra): void {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      // If we run across a tombstone containing energy, pick it up
      const tomb = creep.pos.findInRange(FIND_TOMBSTONES, 1, {
        filter: t => t.store.getUsedCapacity(RESOURCE_ENERGY) > 0,
      });
      for (const t of tomb) creep.withdraw(t, RESOURCE_ENERGY);

      // If there is energy next to us, pick it up
      const dropped = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
        filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 0,
      });
      for (const d of dropped) creep.pickup(d);
    }
  }

  override GetRoomQuota(room: RoomExtra) {
    return room.ClaimedSources.length * 2;
  }

  MinTicksBetweenWorkers = 100;
  IsSpawnNeeded(room: RoomExtra) {
    if (!super.IsSpawnNeeded(room)) return false;
    return Game.time - room.LastSpawnTick(this.name) > this.MinTicksBetweenWorkers;
  }

  // Dispatch a collection task if possible.
  // This function is expected to return a value, and logs a warning when it cannot.
  // Call this function in a section of code where it is already confirmed that this is the right type of task to return,
  // i.e. where you expect it to succeed, the null return is more of a fallback so an error is not thrown.
  CollectFromRandomMiner(creep: CreepExtra): Collect | null {
    // Just dispatch to a random miner in the room regardless of fill state
    // By the time they get there, the miner should hopefully have something to collect,
    // and it should prevent them from searching for new tasks ever idle tick
    // this does make them less responsive however
    const miners = creep.AssignedRoom.AssignedCreeps.filter(c => c.role.groupName === 'Miner');
    if (miners.length > 0) {
      const randomMiner = miners[Math.floor(miners.length * Math.random())];
      return new Collect(randomMiner);
    }

    this.log.warn('Room has no miners to collect from.', { '<creep>': creep });
    return null;
  }

  // Dispatch a collection task if possible.
  // This function is expected to return a value, and logs a warning when it cannot.
  CollectFromRoomStorage(creep: CreepExtra): Collect | null {
    const stored = creep.AssignedRoom.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    if (creep.AssignedRoom.storage !== undefined && stored > creep.AssignedRoom.StorageWartimeEnergyBuffer)
      return new Collect(creep.AssignedRoom.storage);
    return null;
  }

  FindBestCollection(
    creep: CreepExtra,
    possibleSources: ContainerAndAmount[],
    reservedCapacityBySource: Map<string, number>,
    sameRoom = false,
  ): ResourceContainer | null {
    const sourcesWhoCanFullySupplyUs = [];
    for (const possible of possibleSources) {
      // If we expect to be able to fully collect from this source if we attempted to go for it,
      // then add it to the 'best' list.
      possible[1] = possible[1] - (reservedCapacityBySource.get(possible[0].id) ?? 0) - creep.store.getFreeCapacity();
      if (possible[1] >= creep.store.getFreeCapacity()) sourcesWhoCanFullySupplyUs.push(possible);
    }

    // Sort from least to most supply remaining
    sourcesWhoCanFullySupplyUs.sort((a, b) => a[1] - b[1]);

    // Sort from least to most used capacity
    possibleSources.sort((a, b) => a[1] - b[1]);

    const fullSupply = sourcesWhoCanFullySupplyUs.map(s => s[0]);
    const fullestSameRoom =
      fullSupply.length > 0
        ? creep.pos.findClosestByPath(fullSupply, {
            ignoreCreeps: true,
            costCallback: (rn: string, cm: CostMatrix) => creep.CostCallback(rn, cm),
          })
        : null;
    if (fullestSameRoom) return fullestSameRoom;
    if (!sameRoom) {
      const fullestOverall = fullSupply.pop();
      if (fullestOverall) return fullestOverall;
    }

    const anySourceInMyRoom = creep.pos.findClosestByPath(
      possibleSources.map(s => s[0]),
      { costCallback: (rn: string, cm: CostMatrix) => creep.CostCallback(rn, cm) },
    );
    if (anySourceInMyRoom) return anySourceInMyRoom;

    if (!sameRoom) {
      const anySourceAnywhere = possibleSources.map(s => s[0]).pop();
      if (anySourceAnywhere) return anySourceAnywhere;
    }

    return null;
  }

  CollectResources(
    creep: CreepExtra,
    searchForType: ResourceConstant[],
    sameRoom = false,
    minAmountToCollect = 0,
  ): Collect | null {
    // Find according to priorities
    for (const resourceType of searchForType) {
      const candidates = creep.AssignedRoom.CollectionPlan.sourcesByType.get(resourceType);
      if (!candidates || candidates.length === 0) continue;
      const task = this.FindBestCollection(
        creep,
        candidates.filter(c => (minAmountToCollect === 0 ? true : c[1] >= minAmountToCollect)),
        creep.AssignedRoom.CollectionPlan.reservedCapacityBySource,
        sameRoom,
      );
      if (task) {
        // Update reservation in collection plan
        const reservedSoFar = creep.AssignedRoom.CollectionPlan.reservedCapacityBySource.get(task.id);
        if (reservedSoFar)
          creep.AssignedRoom.CollectionPlan.reservedCapacityBySource.set(
            task.id,
            reservedSoFar + creep.store.getFreeCapacity(resourceType),
          );

        // Return collection task
        return new Collect(task, resourceType);
      }
    }

    // No priority found.
    return null;
  }

  WorkersMineBelowMinerBodyTotalCost = 1000;
  DesiredStorageTasks = 2;
  RetireEnabled = false;
  RetireWhenIdleFor = 100;
  SelectNextTask(creep: CreepExtra): CreepTask | null {
    const storage = creep.AssignedRoom.storage;

    // ------ SUPPLY ------
    if (storage !== undefined && creep.store.getUsedCapacity() - creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      for (const resourceType in creep.store)
        if (resourceType !== RESOURCE_ENERGY) return new Supply(storage, resourceType as ResourceConstant);
    }

    if (creep.store.getUsedCapacity() > 0) {
      // Need to spend hauled energy

      // If there aren't enough creeps already delivering to storage, then do that
      const supplyTasks = creep.AssignedRoom.GetAssignedTasks(TaskAction.Supply) as Supply[];
      if (storage !== undefined && storage.store.getFreeCapacity() > 0) {
        const storageSupplyTasks = supplyTasks.filter(t => t.targetId === storage.id);
        if (storageSupplyTasks.length <= this.DesiredStorageTasks) return new Supply(storage);
      }

      // Look for a spending task amongst typical targets
      const spend = this.FindSpendingTask(creep, supplyTasks);
      if (spend) return spend;

      // If still no spending task, and there is storage, then store
      if (storage !== undefined && storage.store.getFreeCapacity() > 0) return new Supply(storage);
    }

    // ------ GATHER ------
    if (creep.store.getUsedCapacity() === 0) {
      // Try to find a gathering task
      const gather = this.CollectResources(creep, RESOURCES_ALL, false, 50);
      if (gather) return gather;

      // If there aren't enough miners, then do mining
      if (
        sum(creep.AssignedRoom.GetAssignedTasksWithCreep(TaskAction.Mine), m => BodyCost(m[0].body)) <
        this.WorkersMineBelowMinerBodyTotalCost
      )
        return this.MineAnyFreePosition(creep);
    }

    // Didn't need or Can't find, gathering or spending task

    // Log a warning if we found nothing to do
    // Ignore the warning if all the sources are out of energy, as
    // that can cause it to spam when everything is running at peak efficiency
    if (creep.AssignedRoom.find(FIND_SOURCES_ACTIVE).length > 0) {
      this.log.warn('SelectNextTask: Literally nothing for me to do, are we overspawned ${idle}?', {
        '<creep>': creep,
        idle: creep.LifetimeIdle,
      });
      const retire = this.ConsiderRetirement(creep);
      if (retire) return retire;
    }

    return null;
  }

  ConsiderRetirement(creep: CreepExtra): Retire | null {
    const spawn = creep.AssignedRoom.SpawnsOrExtensions.filter(
      s => s.structureType === STRUCTURE_SPAWN,
    ).pop() as StructureSpawn;
    if (spawn && this.RetireEnabled && creep.LifetimeIdle > this.RetireWhenIdleFor) return new Retire(spawn);
    return null;
  }

  MineAnyFreePosition(creep: CreepExtra): Mine | null {
    const source = creep.AssignedRoom.UnfilledMiningPositions().pop();
    if (source) return new Mine(source);
    return null;
  }

  MaintainController(creep: CreepExtra): UpgradeController | null {
    if (creep.AssignedRoom.controller) {
      const downgradeMaintenanceThreshold =
        CONTROLLER_DOWNGRADE[creep.AssignedRoom.controller.level] * UpgradeController.DowngradeMaintenanceRatio;
      if (creep.AssignedRoom.controller.ticksToDowngrade < downgradeMaintenanceThreshold)
        return new UpgradeController(creep.AssignedRoom.controller, 'maintain');
    } else {
      this.log.crit(`Assigned room ${creep.AssignedRoom} has no controller!`);
    }
    return null;
  }

  UpgradeController(creep: CreepExtra): UpgradeController | null {
    if (creep.AssignedRoom.controller) {
      return new UpgradeController(creep.AssignedRoom.controller, 'upgrade');
    } else {
      this.log.crit(`Assigned room ${creep.AssignedRoom} has no controller!`);
    }
    return null;
  }

  FindSpawnSupply(
    creep: CreepExtra,
    maxSupplyForSpawns = 0, // 0 = unlimited
    supplyTasks: Supply[] = creep.AssignedRoom.GetAssignedTasks(TaskAction.Supply) as Supply[],
    spawnsOrExtensions = creep.AssignedRoom.SpawnsOrExtensions,
  ): Supply | null {
    const spawnExtensionIds = new Set<string>(spawnsOrExtensions.map(structure => structure.id));
    const spawnSuppliers = supplyTasks.filter(task => spawnExtensionIds.has(task.targetId)).length;
    if (maxSupplyForSpawns === 0 || spawnSuppliers < maxSupplyForSpawns) {
      const spawn = this.FindSupplyByPath(creep, spawnsOrExtensions, 'spawns/extensions', supplyTasks);
      if (spawn) return new Supply(spawn);
    }
    return null;
  }

  MaxSupplyForTowers = 1;
  MaxUpgradePerRoom = 2;
  public FindSpendingTask(
    creep: CreepExtra,
    supplyTasks = creep.AssignedRoom.GetAssignedTasks(TaskAction.Supply) as Supply[],
  ): CreepTask | null {
    const maintainers = creep.AssignedRoom.GetAssignedCreepsOfRole('Maintainer').length;
    if (maintainers === 0) {
      const spawnSupply = this.FindSpawnSupply(creep, 0, supplyTasks);
      if (spawnSupply) return spawnSupply;
    }

    const upgrade = this.UpgradeController(creep);
    if (upgrade && maintainers === 0) return upgrade;
    else if (!upgrade)
      this.log.crit('Assigned Room ${room} as no controller!', { '<creep>': creep, room: creep.AssignedRoom });

    if (creep.AssignedRoom.controller?.level ?? 0 >= 3) {
      const repairsByRoom = new Map<string, AnyStructure[]>();
      for (const structure of creep.AssignedRoom.ClaimedRepairs) {
        const roomRepairs = repairsByRoom.get(structure.pos.roomName) ?? [];
        roomRepairs.push(structure);
        repairsByRoom.set(structure.pos.roomName, roomRepairs);
      }
      const repairs = creep.AssignedRoom.MapWithRoomsInClaimedArea(r =>
        typeof r === 'string' ? [] : (repairsByRoom.get(r.name) ?? []),
      );
      const repairTasks = creep.AssignedRoom.GetAssignedTasks(TaskAction.Repair) as Repair[];
      const repairTasksByRoom = new Map<string, Repair[]>();
      for (const task of repairTasks) {
        const roomName = DeserializeRoomPosition(task.targetPos).roomName;
        const roomTasks = repairTasksByRoom.get(roomName) ?? [];
        roomTasks.push(task);
        repairTasksByRoom.set(roomName, roomTasks);
      }

      for (const [room, roomRepairs] of repairs) {
        if (!(room instanceof Room)) continue;
        const roomTowers = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER });
        const ongoingRepairs = repairTasksByRoom.get(room.name) ?? [];
        const roomTowerIds = new Set<string>(roomTowers.map(tower => tower.id));
        const ongoingTowerSupplies = supplyTasks.filter(task => roomTowerIds.has(task.targetId));

        // Repair if there are no available towers to do it
        if (roomTowers.length === 0) {
          const repair = this.FindIdealRepairByStrength(creep, roomRepairs, ongoingRepairs);
          if (repair) return new Repair(repair);
        } else if (roomTowers.length > 0 && ongoingTowerSupplies.length < this.MaxSupplyForTowers) {
          const tower = this.FindSupplyByPath(creep, roomTowers as StructureTower[], 'towers', supplyTasks);
          if (tower) return new Supply(tower);
        }
      }
    }

    const construction = this.FindConstructionByPriorityAndPath(
      creep,
      creep.AssignedRoom.FlatMapOverRoomsInClaimedArea(r =>
        r instanceof Room ? r.find(FIND_MY_CONSTRUCTION_SITES) : [],
      ),
    );
    if (construction) return new Build(construction);

    return null;
  }

  // prettier-ignore
  ConstructionPriorities: ((c: ConstructionSite) => boolean)[] = [
    (c => c.structureType === STRUCTURE_RAMPART || c.structureType === STRUCTURE_WALL),
    (c => c.structureType === STRUCTURE_SPAWN),
    (c => c.structureType === STRUCTURE_EXTENSION),
    (c => c.structureType === STRUCTURE_ROAD),
    (() => true), // Everything else
  ];

  // prettier-ignore
  SupplyPriorities: [((s: AnyStoreStructure) => boolean), number][] = [
    [(s => s instanceof StructureExtension), 1],
    [(s => s instanceof StructureSpawn), 1],
    [(s => s instanceof StructureTower), 1],
    [(() => true), 1],
  ];

  FindConstructionByPriorityAndPath(
    supplier: CreepExtra,
    candidates: ConstructionSite[] = supplier.AssignedRoom.ConstructionSites,
  ): ConstructionSite | null {
    for (const p of this.ConstructionPriorities) {
      const group = candidates.filter(p);
      if (group.length === 0) continue;

      const sameRoomCandidates = group.filter(s => s.pos.roomName === supplier.room.name);
      const sameRoom =
        sameRoomCandidates.length > 0
          ? supplier.pos.findClosestByPath(sameRoomCandidates, {
              costCallback: (rn: string, cm: CostMatrix) => supplier.CostCallback(rn, cm),
            })
          : null;
      if (sameRoom) return sameRoom;

      const remoteRoom = group
        .filter(s => s.pos.roomName !== supplier.room.name)
        .sort((a, b) => a.progress / a.progressTotal - b.progress / b.progressTotal)
        .pop();
      if (remoteRoom) return remoteRoom;
    }
    return null;
  }

  FindSupplyByPath(
    supplier: CreepExtra,
    candidates: AnyStoreStructure[],
    candidateName?: string,
    inProgressSupplyTasks: Supply[] = supplier.AssignedRoom.GetAssignedTasks(TaskAction.Supply) as Supply[],
  ): AnyStoreStructure | null {
    const suppliersByTarget = new Map<string, number>();
    for (const task of inProgressSupplyTasks)
      suppliersByTarget.set(task.targetId, (suppliersByTarget.get(task.targetId) ?? 0) + 1);

    let considered = 0;
    let groups = 0;
    for (const [p, maxSuppliers] of this.SupplyPriorities) {
      const group: AnyStoreStructure[] = [];
      for (const structure of candidates)
        if (
          structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
          p(structure) &&
          (suppliersByTarget.get(structure.id) ?? 0) < maxSuppliers
        )
          group.push(structure);
      considered += group.length;

      const sameRoomCandidates = group.filter(s => s.room.name === supplier.room.name);
      const sameRoom =
        sameRoomCandidates.length > 0
          ? supplier.pos.findClosestByPath(sameRoomCandidates, {
              costCallback: (rn: string, cm: CostMatrix) => supplier.CostCallback(rn, cm),
            })
          : null;
      if (sameRoom) return sameRoom;

      const remoteRoom = group
        .filter(s => s.room.name !== supplier.room.name)
        .sort(
          (a, b) =>
            a.store.getUsedCapacity(RESOURCE_ENERGY) / a.store.getCapacity(RESOURCE_ENERGY) -
            b.store.getUsedCapacity(RESOURCE_ENERGY) / b.store.getCapacity(RESOURCE_ENERGY),
        )
        .pop();
      if (remoteRoom) return remoteRoom;
      groups++;
    }

    this.log.info(
      `Nothing needs supply${candidateName === undefined ? '' : ` in group: '${candidateName}'`}. Considered ${considered}/${candidates.length} eligible objects across ${groups} groups.`,
      { '<creep>': supplier },
    );
    return null;
  }

  FindIdealRepairByStrength(
    creep: CreepExtra,
    candidates: AnyStructure[],
    inProgressRepairTasks: Repair[],
  ): AnyStructure | undefined | null {
    const candidateIds = new Set<string>(candidates.map(structure => structure.id));
    const targetsByCount = new Map<string, number>();
    for (const t of inProgressRepairTasks) {
      if (!candidateIds.has(t.targetId)) continue;
      targetsByCount.set(t.targetId, (targetsByCount.get(t.targetId) ?? 0) + 1);
    }

    for (const [p, repairAt, maxRepairs] of creep.AssignedRoom.RepairPriorities) {
      let needsRepair: AnyStructure | undefined;
      let lowestHealthRatio = Infinity;
      for (const structure of candidates) {
        const healthRatio = structure.hits / structure.hitsMax;
        if (
          p(structure) &&
          healthRatio < repairAt &&
          (targetsByCount.get(structure.id) ?? 0) < maxRepairs &&
          healthRatio <= lowestHealthRatio
        ) {
          needsRepair = structure;
          lowestHealthRatio = healthRatio;
        }
      }
      if (needsRepair) return needsRepair;
    }

    return null;
  }

  FindIdealRepair(supplier: CreepExtra): AnyStructure | undefined | null {
    const inProgressRepairTasks = supplier.AssignedRoom.GetAssignedTasks(TaskAction.Repair);
    const targetsByCount = new Map<string, number>();
    for (const t of inProgressRepairTasks) {
      const target = 'target' in t ? (t.target as string | undefined) : undefined;
      if (!target) continue;
      const existing = targetsByCount.get(target) ?? 0;
      targetsByCount.set(target, existing + 1);
    }

    for (const [p, repairAt, maxRepairs] of supplier.AssignedRoom.RepairPriorities) {
      const needsRepair = supplier.AssignedRoom.ClaimedRepairs.map(s => ({
        site: s,
        count: targetsByCount.get(s.id) ?? 0,
      }))
        .filter(s => p(s.site) && s.site.hits / s.site.hitsMax < repairAt && s.count < maxRepairs)
        .map(c => c.site);

      if (needsRepair.length > 0)
        return supplier.pos.findClosestByPath(needsRepair, {
          costCallback: (rn: string, cm: CostMatrix) => supplier.CostCallback(rn, cm),
        });
    }

    return null;
  }
}
