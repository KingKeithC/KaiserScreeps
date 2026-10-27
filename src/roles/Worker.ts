import { CreepExtra } from 'Creep';
import { sum } from 'lodash';
import { RoomExtra } from 'Room';
import {
  Build,
  CollectEnergy,
  CreepTask,
  MaintainController,
  Mine,
  Repair,
  Supply,
  TaskAction,
  UpdateController,
} from 'tasks';
import { MakeBody } from 'utils/Collections';
import { BodyCost } from 'utils/CreepUtils';
import { CreepRoleBase, CreepRole } from './Role';

export class Worker extends CreepRoleBase implements CreepRole {
  readonly groupName = 'Workers';
  readonly name: string = 'Worker';

  GetNewCreepBody(room: RoomExtra): BodyPartConstant[] {
    const zygote = MakeBody([CARRY, 2], [WORK, 1], [MOVE, 2]); // 300
    const tiers = [
      // MakeBody([WORK, 11], [CARRY, 6], [MOVE, 8]), // 1800
      MakeBody([WORK, 6], [CARRY, 7], [MOVE, 7]), // 1300
      MakeBody([WORK, 2], [CARRY, 4], [MOVE, 3]), // 550
      zygote,
    ];

    const measure = room.AssignedCreeps.length < 3 ? room.energyAvailable : room.energyCapacityAvailable;
    for (const t of tiers) if (BodyCost(t) <= measure) return t; // Return the first body we can currently afford

    return zygote;
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
    return room.ClaimedSources.length * 3;
  }

  MinTicksBetweenWorkers = 0;
  IsSpawnNeeded(room: RoomExtra) {
    return (
      Game.time - room.LastSpawnTick(this.name) > this.MinTicksBetweenWorkers &&
      this.GetRoomCreepsInRole(room).length < this.GetRoomQuota(room)
    );
  }

  // Dispatch a collection task if possible.
  // This function is expected to return a value, and logs a warning when it cannot.
  // Call this function in a section of code where it is already confirmed that this is the right type of task to return,
  // i.e. where you expect it to succeed, the null return is more of a fallback so an error is not thrown.
  CollectFromRandomMiner(creep: CreepExtra): CollectEnergy | null {
    // Just dispatch to a random miner in the room regardless of fill state
    // By the time they get there, the miner should hopefully have something to collect,
    // and it should prevent them from searching for new tasks ever idle tick
    // this does make them less responsive however
    const miners = creep.AssignedRoom.AssignedCreepsByRoleName.get('Miner') ?? [];
    if (miners.length > 0) {
      const randomMiner = miners[Math.floor(miners.length * Math.random())];
      return new CollectEnergy(randomMiner);
    }

    this.log.warn('Room has no miners to collect from.', { '<creep>': creep });
    return null;
  }

  // Dispatch a collection task if possible.
  // This function is expected to return a value, and logs a warning when it cannot.
  CollectFromRoomStorage(creep: CreepExtra): CollectEnergy | null {
    const stored = creep.AssignedRoom.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    if (
      creep.AssignedRoom.storage !== undefined &&
      stored < creep.AssignedRoom.StorageWartimeEnergyBuffer &&
      !creep.AssignedRoom.StoreOverUpgrade
    )
      return new CollectEnergy(creep.AssignedRoom.storage.id);

    // We log a warning becaue the conditions above should already have been checked, and
    // if this function disagrees, it means the calling logic is incomplete or mis-implemented.
    this.log.warn('Collect from Room Storage not possible.', { '<creep>': creep });
    return null;
  }

  SelectNextTask(creep: CreepExtra): CreepTask | null {
    // if (this.RefillBelowCarryCapacity - this.SpendAboveCarryCapacity < 0)
    //   throw new Error(
    //     `Worker: this.RefillBelowCarryCapacity (${this.RefillBelowCarryCapacity}) should be ` +
    //       `greater than or equal to this.SpendAboveCarryCapacity (${this.SpendAboveCarryCapacity})`,
    //   );

    const currentFillRatio = creep.store.getUsedCapacity(RESOURCE_ENERGY) / creep.store.getCapacity(RESOURCE_ENERGY);

    if (currentFillRatio > 0) {
      // Need to spend hauled energy

      // Look for a spending task amongst typical targets
      const spend = this.FindSpendingTask(creep);
      if (spend) return spend;

      // If no spending task, and controller upgrade is the priority (given no storage alternative), then do upgrade
      if (
        creep.AssignedRoom.controller !== undefined &&
        (creep.AssignedRoom.storage === undefined ||
          (creep.AssignedRoom.storage !== undefined && !creep.AssignedRoom.StoreOverUpgrade))
      )
        return new UpdateController(creep.AssignedRoom.controller);
      else if (creep.AssignedRoom.storage !== undefined && creep.AssignedRoom.StoreOverUpgrade)
        // If still no spending task, and there is storage, then store
        return new Supply(creep.AssignedRoom.storage.id);
    } else {
      // If there aren't enough miners, then do mining
      const totalMinerBodies = sum(creep.AssignedRoom.GetAssignedTasksWithCreep(TaskAction.Mine), m =>
        BodyCost(m[0].body),
      );
      if (totalMinerBodies < this.RelyOnMinersAt) {
        this.log.warn(
          `Emergency mining since too few miners are available (${totalMinerBodies}/${this.RelyOnMinersAt})...`,
          { '<creep>': creep },
        );
        return this.MineAnyFreePosition(creep);
      }

      // Try to find a gathering task
      let gather = this.FindGatheringTask(creep);
      // In case no normal gathering task was found, try gthering from storage
      if (!gather && !creep.AssignedRoom.StoreOverUpgrade) gather = this.CollectFromRoomStorage(creep);
      // If we found a gathering task, return it
      if (gather) return gather;
    }

    // Didn't need or Can't find, gathering or spending task

    // Log a warning if we found nothing to do
    // Ignore the warning if all the sources are out of energy, as
    // that can cause it to spam when everything is running at peak efficiency
    if (creep.AssignedRoom.find(FIND_SOURCES_ACTIVE).length > 0)
      this.log.warn('SelectNextTask: Literally nothing for me to do, are we overspawned?', { '<creep>': creep });

    return null;
  }

  MineAnyFreePosition(creep: CreepExtra): Mine | null {
    const source = creep.AssignedRoom.UnfilledMiningPositions().pop();
    if (source) return new Mine(source);
    return null;
  }

  MaxSupplyForSpawns = 3;
  MaxSupplyForTowers = 2;
  MaxBuildPerRoom = 3;
  MaxRepairPerRoom = 1;
  public FindSpendingTask(creep: CreepExtra): CreepTask | null {
    if (creep.AssignedRoom.controller) {
      const downgradeMaintenanceThreshold =
        CONTROLLER_DOWNGRADE[creep.AssignedRoom.controller.level] * UpdateController.DowngradeMaintenanceRatio;
      if (creep.AssignedRoom.controller.ticksToDowngrade < downgradeMaintenanceThreshold)
        return new MaintainController(creep.AssignedRoom.controller);
    }

    const supplyTasks = creep.AssignedRoom.GetAssignedTasks(TaskAction.Supply) as Supply[];
    if (
      supplyTasks.filter(s => creep.AssignedRoom.SpawnsOrExtensions.some(sp => sp.id === s.target)).length <
      this.MaxSupplyForSpawns
    ) {
      const spawn = this.FindSupplyByPath(creep, creep.AssignedRoom.SpawnsOrExtensions, 'spawns/extensions');
      if (spawn) return new Supply(spawn.id);
    }

    if (creep.AssignedRoom.controller === undefined)
      throw new Error(`Assigned room ${creep.AssignedRoom} has no controller!`);

    if (creep.AssignedRoom.controller.level === 1) return new UpdateController(creep.AssignedRoom.controller);

    const constructions = creep.AssignedRoom.FlatMapOverRoomsInClaimedArea(r =>
      r instanceof Room ? r.find(FIND_MY_CONSTRUCTION_SITES) : [],
    );
    const buildTasks = creep.AssignedRoom.GetAssignedTasks(TaskAction.Build) as Build[];
    if (buildTasks.filter(b => constructions.some(c => c.id === b.target)).length < this.MaxBuildPerRoom) {
      const cons = this.FindConstructionByPriorityAndPath(creep, constructions);
      if (cons) return new Build(cons.id);
    }

    // Don't bother with repairs below RCL3
    if (creep.AssignedRoom.controller.level >= 3) {
      const repairs = creep.AssignedRoom.MapWithRoomsInClaimedArea(r =>
        r instanceof Room ? r.find(FIND_STRUCTURES, { filter: s => s.hits < s.hitsMax }) : [],
      );
      const repairTasks = creep.AssignedRoom.GetAssignedTasks(TaskAction.Repair) as Repair[];

      for (const [room, roomRepairs] of repairs) {
        if (!(room instanceof Room)) continue;
        const roomTowers = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER });
        const ongoingRepairs = repairTasks.filter(rt => rt.repairRoom === room.name);
        const ongoingTowerSupplys = supplyTasks.filter(st => creep.AssignedRoom.Towers.some(t => t.id === st.target));

        // Repair if there are no available towers to do it
        if (roomTowers.length === 0 && ongoingRepairs.length < this.MaxRepairPerRoom) {
          const repair = this.FindIdealRepairByStrength(creep, roomRepairs);
          if (repair) return new Repair(repair);
        } else if (roomTowers.length > 0 && ongoingTowerSupplys.length < this.MaxSupplyForTowers) {
          const tower = this.FindSupplyByPath(creep, creep.AssignedRoom.Towers, 'towers');
          if (tower) return new Supply(tower.id);
        }
      }
    }

    return null;
  }

  RelyOnMinersAt = 1000;
  FindGatheringTask(creep: CreepExtra): CreepTask | null {
    // const miners = (creep.AssignedRoom.AssignedCreepsByRoleGroup.get('Miners') ?? []).filter(m => !m.spawning);
    const miners = creep.AssignedRoom.AssignedCreeps.filter(m => !m.spawning && m.currentTask instanceof Mine);
    // prettier-ignore
    const possibleSources: [
      CreepExtra | StructureLink | StructureContainer | Resource<RESOURCE_ENERGY> | Ruin | Tombstone,
      number,
    ][] = [
      /* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
      ...creep.AssignedRoom.FlatMapOverRoomsInClaimedArea(cr => cr instanceof Room ? cr.find(FIND_TOMBSTONES, { filter: t => t.store.getUsedCapacity(RESOURCE_ENERGY) > 0 }) : []) as Tombstone[],
      ...creep.AssignedRoom.FlatMapOverRoomsInClaimedArea(cr => cr instanceof Room ? cr.find(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 0 }) : []) as Resource<RESOURCE_ENERGY>[],
      ...creep.AssignedRoom.FlatMapOverRoomsInClaimedArea(cr => cr instanceof Room ? cr.find(FIND_RUINS, {filter: r=> r.store.getUsedCapacity(RESOURCE_ENERGY) > 0}) : []) as Ruin[],
      ...creep.AssignedRoom.FlatMapOverRoomsInClaimedArea(cr => cr instanceof Room ? cr.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0}) : []) as StructureContainer[],
      ...creep.AssignedRoom.LinkReceivers.filter(lr => lr.store.getUsedCapacity(RESOURCE_ENERGY) > 0) as StructureLink[],
      ...miners.filter(m => m.store.getUsedCapacity(RESOURCE_ENERGY) > 0),
      /* eslint-enable @typescript-eslint/no-unnecessary-type-assertion */
    ].map(ps => [ps, ps instanceof Resource ? ps.amount : ps.store.getUsedCapacity(RESOURCE_ENERGY)]);

    const sourcesWhoCanFullySupplyUs = [];
    for (const possible of possibleSources) {
      // Who else is coming to collect from this source already
      const incomingCollectors = creep.AssignedRoom.GetAssignedTasksWithCreep(TaskAction.CollectEnergy).filter(
        ce => (ce[1] as CollectEnergy).targetId === possible[0].id,
      );

      // How much energy is scheduled to be withdrawn currently
      const totalWithdrawls = sum(incomingCollectors, collector => collector[0].store.getFreeCapacity(RESOURCE_ENERGY));

      // If we expect to be able to fully collect from this source if we attempted to go for it,
      // then add it to the 'best' list.
      if (possible[1] - totalWithdrawls >= creep.store.getFreeCapacity(RESOURCE_ENERGY))
        sourcesWhoCanFullySupplyUs.push(possible);
    }

    const canFullySupplyUs = sourcesWhoCanFullySupplyUs.map(s => s[0]);
    const canFullySupplyUsInSameRoomAsCreep = creep.pos.findClosestByPath(canFullySupplyUs, { ignoreCreeps: true });
    const canFullySupplyUsAnywhere = canFullySupplyUs.pop();

    const anySourceInMyRoom = creep.pos.findClosestByPath(
      possibleSources.map(s => s[0]),
      { ignoreCreeps: true },
    );
    const anySourceAnywhere = possibleSources.map(s => s[0]).pop();
    const best =
      canFullySupplyUsInSameRoomAsCreep ?? canFullySupplyUsAnywhere ?? anySourceInMyRoom ?? anySourceAnywhere;

    this.log.info(
      `FindGatheringTask: ${JSON.stringify({
        best: String(best),
        countCanFullySupplyUs: canFullySupplyUs.length,
        canFullySupplyUsInSameRoomAsCreep: String(canFullySupplyUsInSameRoomAsCreep),
        canFullySupplyUsAnywhere: String(canFullySupplyUsAnywhere),
        countAnyPossibleSource: possibleSources.length,
        anySourceInMyRoom: String(anySourceInMyRoom),
        anySourceAnywhere: String(anySourceAnywhere),
      })}`,
    );

    if (best) return new CollectEnergy(best);
    else return null;
  }

  IgnoreDroppedResourcesLessThan = 30;
  MediumSearchRange = 20;
  ShortSearchRange = 5;

  // prettier-ignore
  ConstructionPriorities: ((c: ConstructionSite) => boolean)[] = [
    (c => c.structureType === STRUCTURE_SPAWN),
    (c => c.structureType === STRUCTURE_ROAD),
    (c => c.structureType === STRUCTURE_EXTENSION || c.structureType === STRUCTURE_SPAWN),
    (c => c.structureType === STRUCTURE_STORAGE || c.structureType === STRUCTURE_CONTAINER),
    (c => c.structureType === STRUCTURE_RAMPART || c.structureType === STRUCTURE_WALL),
    (() => true),
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

      const sameRoom = supplier.pos.findClosestByPath(
        group.filter(s => s.pos.roomName === supplier.room.name),
        { ignoreCreeps: true },
      );
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
  ): AnyStoreStructure | null {
    const inProgressSupplyTasks = supplier.AssignedRoom.GetAssignedTasks(TaskAction.Supply) as Supply[];
    let considered = 0;
    let groups = 0;
    for (const [p, maxSuppliers] of this.SupplyPriorities) {
      const group = candidates
        .map(s => ({ structure: s, suppliers: inProgressSupplyTasks.filter(ist => ist.target === s.id).length }))
        .filter(
          s => s.structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && p(s.structure) && s.suppliers < maxSuppliers,
        )
        .map(s => s.structure);
      considered += group.length;

      const sameRoom = supplier.pos.findClosestByPath(
        group.filter(s => s.room.name === supplier.room.name),
        { ignoreCreeps: true },
      );
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

  FindIdealRepairByStrength(creep: CreepExtra, candidates: AnyStructure[]): AnyStructure | undefined | null {
    const inProgressRepairTasks = creep.AssignedRoom.GetAssignedTasks(TaskAction.Repair).filter(
      t => (t as Repair).repairRoom === creep.room.name,
    );
    const targetsByCount = new Map<string, number>();
    for (const t of inProgressRepairTasks) {
      const target = 'target' in t ? (t.target as string | undefined) : undefined;
      if (!target) continue;
      const existing = targetsByCount.get(target) ?? 0;
      targetsByCount.set(target, existing + 1);
    }

    for (const [p, repairAt, maxRepairs] of creep.AssignedRoom.RepairPriorities) {
      const needsRepair = candidates
        .map(s => ({ site: s, count: targetsByCount.get(s.id) ?? 0 }))
        .filter(s => p(s.site) && s.site.hits / s.site.hitsMax < repairAt && s.count < maxRepairs)
        .map(c => c.site)
        .sort((b, a) => a.hits / a.hitsMax - b.hits / b.hitsMax)
        .pop();

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
      const needsRepair = supplier.AssignedRoom.Repairs.map(s => ({ site: s, count: targetsByCount.get(s.id) ?? 0 }))
        .filter(s => p(s.site) && s.site.hits / s.site.hitsMax < repairAt && s.count < maxRepairs)
        .map(c => c.site);

      if (needsRepair.length > 0) return supplier.pos.findClosestByPath(needsRepair, { ignoreCreeps: true });
    }

    return null;
  }
}
