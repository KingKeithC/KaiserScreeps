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

  MinTicksBetweenWorkers = 200;
  IsSpawnNeeded(room: RoomExtra) {
    return (
      Game.time - room.LastSpawnTick(this.name) > this.MinTicksBetweenWorkers &&
      (room.AssignedCreepsByRoleName.get('Worker') ?? []).length < this.GetRoomQuota(room)
    );
  }

  SelectNextTask(creep: CreepExtra): CreepTask | null {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      const gather = this.FindGatheringTask(creep);
      if (gather) return gather;

      if (creep.AssignedRoom.storage !== undefined) {
        const stored = creep.AssignedRoom.storage.store.getUsedCapacity(RESOURCE_ENERGY);
        const msg = `No gather tasks, taking from storage...`;

        if (stored < creep.AssignedRoom.StorageWartimeEnergyBuffer) {
          this.log.warn(
            `${msg} !!! Except storage is below Emergency amount (${stored} < !${creep.AssignedRoom.StorageWartimeEnergyBuffer})`,
            { '<creep>': creep },
          );
          return null;
        }

        // Don't fallback to collecting from storage if we had no previous task
        if (creep.currentTask === null) return null;

        // Don't fallback to collecting from storage if we just supplied it
        if (creep.currentTask.action === TaskAction.Supply)
          if ((creep.currentTask as Supply).target === creep.AssignedRoom.storage.id) return null;

        // Should be okay to collect from storage
        this.log.info(msg, { '<creep>': creep });
        return new CollectEnergy({ kind: 'storage', id: creep.AssignedRoom.storage.id });
      } else {
        this.log.info(`No gather Tasks, and no buffer in storage...`, { '<creep>': creep });
        return null;
      }
    } else if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      const spend = this.FindSpendingTask(creep);
      if (spend) return spend;

      if (creep.AssignedRoom.storage !== undefined) {
        this.log.info(`No spending Tasks, storing...`, { '<creep>': creep });
        return new Supply(creep.AssignedRoom.storage.id);
      } else if (creep.AssignedRoom.controller !== undefined) {
        this.log.info(`No spending Tasks, and nowhere to put energy, so upgrading...`, { '<creep>': creep });
        return new UpdateController(creep.AssignedRoom.controller);
      } else {
        this.log.info(`No spending Tasks, and nowhere to put energy...`, { '<creep>': creep });
        return null;
      }
    }

    return null;
  }

  MaxSupplyForSpawns = 3;
  MaxSupplyForTowers = 2;
  MaxBuildPerRoom = 3;
  MaxUpgraders = 1;
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

    const currentUpgradeCount = creep.AssignedRoom.GetAssignedTasks(TaskAction.UpgradeController).length;
    if (currentUpgradeCount < this.MaxUpgraders) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return new UpdateController(creep.AssignedRoom.controller, { mode: 'upgrade' });
    }

    return null;
  }

  RelyOnMinersAt = 1000;
  FindGatheringTask(creep: CreepExtra): CreepTask | null {
    const activeDeliveries = creep.AssignedRoom.GetAssignedTasks(TaskAction.CollectEnergy) as CollectEnergy[];
    // const miners = (creep.AssignedRoom.AssignedCreepsByRoleGroup.get('Miners') ?? []).filter(m => !m.spawning);
    const miners = creep.AssignedRoom.AssignedCreeps.filter(m => !m.spawning && m.currentTask instanceof Mine);
    // prettier-ignore
    const allSources = [
      /* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
      ...creep.AssignedRoom.FlatMapOverRoomsInClaimedArea(cr => cr instanceof Room ? cr.find(FIND_TOMBSTONES, { filter: t => t.store.getUsedCapacity(RESOURCE_ENERGY) > 0 }) : []) as Tombstone[],
      ...creep.AssignedRoom.FlatMapOverRoomsInClaimedArea(cr => cr instanceof Room ? cr.find(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY }) : []) as Resource<RESOURCE_ENERGY>[],
      ...creep.AssignedRoom.FlatMapOverRoomsInClaimedArea(cr => cr instanceof Room ? cr.find(FIND_RUINS) : []) as Ruin[],
      ...creep.AssignedRoom.FlatMapOverRoomsInClaimedArea(cr => cr instanceof Room ? cr.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER }) : []) as StructureContainer[],
      ...creep.AssignedRoom.LinkReceivers as StructureLink[],
      ...miners,
      /* eslint-enable @typescript-eslint/no-unnecessary-type-assertion */
    ];
    const possibleSources: (
      CreepExtra | StructureLink | StructureContainer | Resource<RESOURCE_ENERGY> | Ruin | Tombstone
    )[] = [];

    for (const possible of allSources) {
      const sourceEnergyAvailable =
        possible instanceof Resource ? possible.amount : possible.store.getUsedCapacity(RESOURCE_ENERGY);

      const acceptibleDeliveryCount = Math.floor(sourceEnergyAvailable / creep.store.getCapacity(RESOURCE_ENERGY));

      const currentDeliveryCount = activeDeliveries.filter(ad => {
        if (ad.source.kind === 'container') return ad.source.id === possible.id;
        else if (ad.source.kind === 'creep' && possible instanceof CreepExtra) return ad.source.name === possible.name;
        else if (ad.source.kind === 'dropped') return ad.source.id === possible.id;
        else if (ad.source.kind === 'link') return ad.source.id === possible.id;
        else if (ad.source.kind === 'ruin') return ad.source.id === possible.id;
        else if (ad.source.kind === 'tomb') return ad.source.id === possible.id;
        else return false;
      }).length;

      if (currentDeliveryCount < acceptibleDeliveryCount) possibleSources.push(possible);
    }

    const sameRoom = creep.pos.findClosestByPath(
      possibleSources.filter(s => s.pos.roomName === creep.room.name),
      { ignoreCreeps: true },
    );
    if (sameRoom instanceof StructureContainer)
      return new CollectEnergy({ kind: 'container', id: sameRoom.id }, { maxAttempts: 3 });
    else if (sameRoom instanceof StructureLink)
      return new CollectEnergy({ kind: 'link', id: sameRoom.id }, { maxAttempts: 3 });
    else if (sameRoom instanceof Creep || sameRoom instanceof CreepExtra)
      return new CollectEnergy({ kind: 'creep', name: sameRoom.name }, { maxAttempts: 8 });
    else if (sameRoom instanceof Ruin) return new CollectEnergy({ kind: 'ruin', id: sameRoom.id }, { maxAttempts: 3 });
    else if (sameRoom instanceof Tombstone)
      return new CollectEnergy({ kind: 'tomb', id: sameRoom.id }, { maxAttempts: 3 });
    else if (sameRoom instanceof Resource)
      return new CollectEnergy({ kind: 'dropped', id: sameRoom.id }, { maxAttempts: 3 });

    const totalMinerBodies = sum(miners, m => BodyCost(m.body));
    this.log.info(`Total Miner Body Cost in ${creep.AssignedRoom.name}'s Area: ${totalMinerBodies}`);

    const amountMapper = (a: Resource | { store: StoreDefinition }) =>
      a instanceof Resource ? a.amount : a.store.getUsedCapacity(RESOURCE_ENERGY);
    const mostInNeed = possibleSources.sort((b, a) => amountMapper(a) - amountMapper(b))[0];
    if (mostInNeed instanceof StructureContainer)
      return new CollectEnergy({ kind: 'container', id: mostInNeed.id }, { maxAttempts: 3 });
    else if (mostInNeed instanceof StructureLink)
      return new CollectEnergy({ kind: 'link', id: mostInNeed.id }, { maxAttempts: 3 });
    else if (mostInNeed instanceof Creep || mostInNeed instanceof CreepExtra)
      return new CollectEnergy({ kind: 'creep', name: mostInNeed.name }, { maxAttempts: 8 });
    else if (mostInNeed instanceof Ruin)
      return new CollectEnergy({ kind: 'ruin', id: mostInNeed.id }, { maxAttempts: 3 });
    else if (mostInNeed instanceof Tombstone)
      return new CollectEnergy({ kind: 'tomb', id: mostInNeed.id }, { maxAttempts: 3 });
    else if (mostInNeed instanceof Resource)
      return new CollectEnergy({ kind: 'dropped', id: mostInNeed.id }, { maxAttempts: 3 });
    else if (totalMinerBodies < this.RelyOnMinersAt) {
      this.log.warn(
        `Emergency mining since too few miners are available (${totalMinerBodies}/${this.RelyOnMinersAt})...`,
        { '<creep>': creep },
      );
      const source = creep.AssignedRoom.UnfilledMiningPositions().pop();
      if (source) return new Mine(source);
    }
    return null;
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
