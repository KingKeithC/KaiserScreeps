import { CreepExtra } from "Creep";
import { RoomExtra } from "Room";
import { Build, CollectEnergy, CreepTask, EnergySource, Idle, MaintainController, Mine, Pickup, Repair, Supply, TaskAction, UpdateController } from "tasks";
import { MakeBody, MyConstructionSites, MySpawnsOrExtensions, MyTowers } from "utils/Collections";
import { BodyCost } from "utils/CreepUtils";
import { CreepRoleBase, CreepRole } from "./Role";

export class Worker extends CreepRoleBase implements CreepRole {
  readonly groupName = "Workers";
  readonly name: string = "Worker";
  readonly tier: number = 1;

  GetNewCreepBody(room: RoomExtra): BodyPartConstant[] {
    const tiers = [
      MakeBody(
        [MOVE, 1],
        [WORK, 1],
        [CARRY, 1],
      ),
      MakeBody(
        [MOVE, 3],
        [WORK, 2],
        [CARRY, 4],
      ),
      MakeBody(
        [MOVE, 7],
        [WORK, 6],
        [CARRY, 7],
      ),
    ];

    var costs = [];
    for (const body of tiers.reverse()) {
      const cost = BodyCost(body);
      costs.push(cost);
      if (room.energyCapacityAvailable >= cost) {
        return body;
      }
    }

    this.log.crit(`Room lacks energy capacity for all types of body! Tried: ${costs}`);
    return [];
  }

  TickCreep(creep: CreepExtra): void {
    // If we run across a tombstone containing energy, pick it up
    const tomb = creep.pos.findInRange(FIND_TOMBSTONES, 1, { filter: t => t.store.getUsedCapacity(RESOURCE_ENERGY) > 0 });
    for (const t of tomb) creep.withdraw(t, RESOURCE_ENERGY);
  }

  override GetGlobalQuota(): number {
    return -1;
  }

  // 3 workers per mine
  override GetRoomQuota(room: RoomExtra) { return room.MaxMiners * 3; }

  IsSpawnNeeded(_room: RoomExtra) { return true; }

  SelectNextTask(creep: CreepExtra): CreepTask | null {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
      return this.FindGatheringTask(creep);
    // else if (creep.AssignedRoom.Hostiles.length > 0)
    //   return this.FindWartimeSpendingTask(creep);
    else if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0)
      return this.FindSpendingTask(creep);
    else
      return null;
  }

  CurrentAssignedTasks(room: RoomExtra): CreepTask[] {
    return room.AssignedCreeps
      .filter(c => c.memory.role.startsWith("Worker"))
      .map(c => c.currentTask ?? new Idle());
  }

  FindWartimeSpendingTask(creep: CreepExtra): CreepTask {
    const spawnNeedingEnergy = this.FindSupplyByPriorityAndPath(creep, creep.AssignedRoom.SpawnsOrExtensions);
    if (spawnNeedingEnergy) return new Supply(spawnNeedingEnergy.id as Id<AnyStoreStructure>);

    const site = this.FindConstructionByPriorityAndPath(creep);
    if (site) return new Build(site.id as Id<ConstructionSite<BuildableStructureConstant>>);

    const towerNeedingEnergy = this.FindSupplyByPriorityAndPath(creep, creep.AssignedRoom.Towers);
    if (towerNeedingEnergy) return new Supply(towerNeedingEnergy.id as Id<AnyStoreStructure>);

    const damaged = this.FindIdealRepair(creep);
    if (damaged) return new Repair(damaged);

    this.log.warn("No wartime spending tasks!");
    return new Idle();
  }

  MaxUpgraders = 2;
  MaxSupplyForSpawns = 4;
  MaxSupplyForTowers = 3;
  MaxRepairPerRoom = 2;
  public FindSpendingTask(creep: CreepExtra): CreepTask {
    if (creep.AssignedRoom.controller) {
      const downgradeMaintenanceThreshold = CONTROLLER_DOWNGRADE[creep.AssignedRoom.controller.level] * UpdateController.DowngradeMaintenanceRatio;
      if (creep.AssignedRoom.controller.ticksToDowngrade < downgradeMaintenanceThreshold)
        return new MaintainController(creep.AssignedRoom.controller);
    }

    const supplyTasks = creep.AssignedRoom.GetAssignedTasks(TaskAction.Supply) as Supply[];
    const spawnsExtensions = MySpawnsOrExtensions();
    const existingSpawnExtensionSupplyTasks = supplyTasks.filter(st => spawnsExtensions.some(se => se.id === (st as Supply).target));

    if (existingSpawnExtensionSupplyTasks.length < this.MaxSupplyForSpawns) {
      const spawn = this.FindSupplyByPriorityAndPath(creep, spawnsExtensions);
      if (spawn) return new Supply(spawn.id as Id<AnyStoreStructure>);
    }

    const cons = this.FindConstructionByPriorityAndPath(creep, MyConstructionSites());
    if (cons) return new Build(cons.id as Id<ConstructionSite<BuildableStructureConstant>>);

    // If there are no towers in this room
    const currentRepairs = creep.AssignedRoom.GetAssignedTasks(TaskAction.Repair) as Repair[];
    if (MyTowers().filter(t => t.pos.roomName === creep.pos.roomName).length === 0) {
      if (currentRepairs.filter(r => r.repairRoom === creep.pos.roomName).length < this.MaxRepairPerRoom) {
        const repair = this.FindIdealRepairByStrength(creep);
        if (repair) return new Repair(repair);
      }
    } else {
      const towers = MyTowers();
      const existingTowerSupplyTasks = supplyTasks.filter(st => towers.some(t => t.id === st.target));

      if (existingTowerSupplyTasks.length < this.MaxSupplyForTowers) {
        const tower = this.FindSupplyByPriorityAndPath(creep, towers);
        if (tower) return new Supply(tower.id);
      }
    }

    const currentUpgradeCount = creep.AssignedRoom.GetAssignedTasks(TaskAction.UpgradeController).length;
    if (currentUpgradeCount < this.MaxUpgraders) {
      return new UpdateController(creep.AssignedRoom.controller!, { mode: "upgrade" });
    }

    // If room has storage with room, put it there
    if (creep.AssignedRoom.storage && creep.AssignedRoom.storage.store.getFreeCapacity(RESOURCE_ENERGY))
      return new Supply(creep.AssignedRoom.storage.id as Id<AnyStoreStructure>);

    // this.log.warn("No spending tasks found!");
    return new Idle();
  }

  FindDroppedEnergy(creep: CreepExtra): Pickup | null {
    const droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY });
    for (const res of droppedResources) {
      const countPickingUpSameRes = creep.AssignedRoom.GetAssignedTasks(TaskAction.Pickup).filter(
        t => "target" in t && t.target === res.id,
      ).length;
      if (countPickingUpSameRes) continue;
      const path = creep.pos.findPathTo(res, { ignoreCreeps: true });
      const distance = path.length;
      const approxAmtRemaining = Math.ceil(res.amount / 1000) * distance;
      const collect = approxAmtRemaining > this.IgnoreDroppedResourcesLessThan;
      this.log.debug(`${collect ? "Collecting" : "Ignoring"} Dropped ${res} that is ${distance} steps away, currently has ${res.amount} remaining, we expect ${approxAmtRemaining} by the time we get there.`);
      if (collect) return new Pickup(res.id as Id<Resource<RESOURCE_ENERGY>>);
    }

    return null;
  }

  FindEnergeticRuin(creep: CreepExtra): Ruin | null {
    const ruins = creep.AssignedRoom.find(FIND_RUINS, { filter: r => r.store.getUsedCapacity(RESOURCE_ENERGY) });
    return creep.pos.findClosestByPath(ruins, { ignoreCreeps: true });
  }

  ContainerAmountNeededToTake = 50;
  MaxIncomingPerEnergySource = 2;
  FindGatheringTask(creep: CreepExtra): CreepTask | null {
    const dropped = this.FindDroppedEnergy(creep);
    if (dropped) return dropped;

    const ruin = this.FindEnergeticRuin(creep);
    if (ruin) return new CollectEnergy({ kind: "ruin", id: ruin.id });

    const activeDeliveries = creep.AssignedRoom.GetAssignedTasks(TaskAction.CollectEnergy) as CollectEnergy[];
    const miners = creep.AssignedRoom.AssignedCreepsByRoleGroup.get("Miners") ?? [];
    const possibleSources: (CreepExtra | StructureLink | StructureStorage | StructureContainer)[] = [];

    for (const possible of [
      ...creep.AssignedRoom.Containers,
      ...creep.AssignedRoom.LinkReceivers,
      ...(creep.AssignedRoom.storage != undefined ? [creep.AssignedRoom.storage] : []),
      ...miners,
    ]) {

      // Skip Energy sources that have too little energy
      if (possible.store.getUsedCapacity(RESOURCE_ENERGY) < this.ContainerAmountNeededToTake) {
        // this.log.info(`!Possibility: too little energy ${possible}`);
        continue;
      }

      // Skip energy sources based on type, and incomining collection tasks
      if (possible instanceof StructureStorage) {
        // Skip Storage if it has less than the wartime amount
        if (possible.store.getUsedCapacity(RESOURCE_ENERGY) <= creep.AssignedRoom.StorageWartimeEnergyBuffer) {
          // this.log.info(`!Possibility: StructureStorage: less than the wartime amount ${possible}`);
          continue;
        }

        // Skip source if it has too many incoming deliveries already
        if (activeDeliveries.filter(ad => ad.source.kind === "storage" && ad.source.id === possible.id).length > this.MaxIncomingPerEnergySource) {
          // this.log.info(`!Possibility: StructureStorage: too many incoming deliveries already ${possible}`);
          continue;
        }

      } else if (possible instanceof StructureContainer) {
        // Skip source if it has too many incoming deliveries already
        if (activeDeliveries.filter(ad => ad.source.kind === "container" && ad.source.id === possible.id).length > this.MaxIncomingPerEnergySource) {
          // this.log.info(`!Possibility: StructureContainer: too many incoming deliveries already`);
          continue;
        }

      } else if (possible instanceof Creep) {
        // Skip source if it has too many incoming deliveries already
        if (activeDeliveries.filter(ad => ad.source.kind === "creep" && ad.source.name === possible.name).length > this.MaxIncomingPerEnergySource) {
          // this.log.info(`!Possibility: Creep: too many incoming deliveries already`);
          continue;
        }

      } else if (possible instanceof StructureLink) {
        // Skip source if it has too many incoming deliveries already
        if (activeDeliveries.filter(ad => ad.source.kind === "link" && ad.source.id === possible.id).length > this.MaxIncomingPerEnergySource) {
          // this.log.info(`!Possibility: StructureLink: too many incoming deliveries already`);
          continue;
        }
      } else {
        // this.log.warn(`Unknown Energy Possibility: ${possible}`);
        continue;
      }

      // this.log.info(`Possibility: ${possible}`);
      possibleSources.push(possible);
    }

    const energySource = possibleSources
      .sort((a, b) => a.store.getUsedCapacity(RESOURCE_ENERGY) - b.store.getUsedCapacity(RESOURCE_ENERGY))
      .pop();
    if (energySource) {
      if (energySource instanceof StructureContainer) return new CollectEnergy({ kind: "container", id: energySource.id }, { maxAttempts: 3 });
      if (energySource instanceof StructureLink) return new CollectEnergy({ kind: "link", id: energySource.id }, { maxAttempts: 3 });
      if (energySource instanceof StructureStorage) return new CollectEnergy({ kind: "storage", id: energySource.id }, { maxAttempts: 3 });
      if (energySource instanceof Creep) return new CollectEnergy({ kind: "creep", name: energySource.name }, { maxAttempts: 3 });
    }

    if (miners.length === 0) {
      // Do mining on our own
      const source = creep.AssignedRoom.GetUnassignedMiningPositions().pop();
      if (source) return new Mine(source);
    }

    // this.log.info(`FindGatheringTask no tasks found!`, { "<creep>": creep });
    return null;
  }

  IgnoreDroppedResourcesLessThan = 30;
  MediumSearchRange = 20;
  ShortSearchRange = 5;

  ConstructionPriorities: ((c: ConstructionSite) => boolean)[] = [
    (c => c.structureType === STRUCTURE_ROAD),
    (c => c.structureType === STRUCTURE_EXTENSION || c.structureType === STRUCTURE_SPAWN),
    (c => c.structureType === STRUCTURE_STORAGE || c.structureType === STRUCTURE_CONTAINER),
    (c => c.structureType === STRUCTURE_RAMPART || c.structureType === STRUCTURE_WALL),
    (_ => true),
  ];

  SupplyPriorities: [((s: AnyStoreStructure) => boolean), number][] = [
    [(s => s instanceof StructureExtension), 1],
    [(s => s instanceof StructureSpawn), 2],
    [(s => s instanceof StructureTower), 3],
    [(_ => true), 1],
  ];

  FindConstructionByPriorityAndPath(creep: CreepExtra, candidates: ConstructionSite[] = creep.AssignedRoom.ConstructionSites): ConstructionSite | null {
    for (const p of this.ConstructionPriorities) {
      const group = candidates.filter(p);
      if (group.length) return creep.pos.findClosestByPath(group, { ignoreCreeps: true });
    }
    return null;
  }

  FindSupplyByPriorityAndPath(supplier: CreepExtra, candidates: AnyStoreStructure[]): AnyStoreStructure | null {
    const inProgressSupplyTasks = this.CurrentAssignedTasks(supplier.AssignedRoom).filter(t => t.action === TaskAction.Supply);
    const supplyTargetsByCount = new Map<string, number>();
    for (const t of inProgressSupplyTasks) {
      const target = "target" in t ? (t.target as string | undefined) : undefined;
      if (!target) continue;
      const existing = supplyTargetsByCount.get(target) ?? 0;
      supplyTargetsByCount.set(target, existing + 1);
    }

    for (const [p, maxSuppliers] of this.SupplyPriorities) {
      const needsSupply = candidates
        .map(s => ({ structure: s, suppliers: supplyTargetsByCount.get(s.id) ?? 0 }))
        .filter(s => s.structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && p(s.structure) && s.suppliers < maxSuppliers)
        .map(s => s.structure);

      if (needsSupply.length) return supplier.pos.findClosestByPath(needsSupply, { ignoreCreeps: true });
    }

    return null;
  }

  FindIdealRepairByStrength(creep: CreepExtra): AnyStructure | undefined | null {
    const inProgressRepairTasks = creep.AssignedRoom.GetAssignedTasks(TaskAction.Repair).filter(t => (t as Repair).repairRoom === creep.room.name);
    const targetsByCount = new Map<string, number>();
    for (const t of inProgressRepairTasks) {
      const target = "target" in t ? (t.target as string | undefined) : undefined;
      if (!target) continue;
      const existing = targetsByCount.get(target) ?? 0;
      targetsByCount.set(target, existing + 1);
    }

    const repairs = creep.room.find(FIND_STRUCTURES, { filter: s => s.hits < s.hitsMax });
    for (const [p, repairAt, maxRepairs] of creep.AssignedRoom.RepairPriorities) {
      const needsRepair = repairs
        .map(s => ({ site: s, count: targetsByCount.get(s.id) ?? 0 }))
        .filter(s => p(s.site) && (s.site.hits / s.site.hitsMax) < repairAt && s.count < maxRepairs)
        .map(c => c.site)
        .sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax))
        .pop();

      if (needsRepair) return needsRepair;
    }

    return null;
  }

  FindIdealRepair(supplier: CreepExtra): AnyStructure | undefined | null {
    const inProgressRepairTasks = supplier.AssignedRoom.GetAssignedTasks(TaskAction.Repair);
    const targetsByCount = new Map<string, number>();
    for (const t of inProgressRepairTasks) {
      const target = "target" in t ? (t.target as string | undefined) : undefined;
      if (!target) continue;
      const existing = targetsByCount.get(target) ?? 0;
      targetsByCount.set(target, existing + 1);
    }

    for (const [p, repairAt, maxRepairs] of supplier.AssignedRoom.RepairPriorities) {
      const needsRepair = supplier.AssignedRoom.Repairs
        .map(s => ({ site: s, count: targetsByCount.get(s.id) ?? 0 }))
        .filter(s => p(s.site) && (s.site.hits / s.site.hitsMax) < repairAt && s.count < maxRepairs)
        .map(c => c.site);

      if (needsRepair.length > 0) return supplier.pos.findClosestByPath(needsRepair, { ignoreCreeps: true });
    }

    return null;
  }
}
