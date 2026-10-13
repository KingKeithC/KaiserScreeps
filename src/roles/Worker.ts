import { CreepExtra } from "Creep";
import { RoomExtra } from "Room";
import { Build, CollectEnergy, CreepTask, Idle, MaintainController, Mine, Pickup, Repair, Supply, TaskAction, UpdateController } from "Tasks";
import { MakeBody } from "utils/Collections";
import { CreepRoleBase, CreepRole } from "./Role";

export class Worker extends CreepRoleBase implements CreepRole {
  readonly groupName = "Workers";
  readonly name: string = "Worker";
  readonly tier: number = 1;

  StartSpawnAtRCL = 0;
  StopSpawnAtRCL = 8;

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
      const cost = CreepExtra.BodyCost(body);
      costs.push(cost);
      if (room.energyCapacityAvailable >= cost) {
        return body;
      }
    }

    this.log.crit(`Room lacks energy capacity for all types of body! Tried: ${costs}`);
    return [];
  }

  GetGlobalQuota(): number { return -1; }
  override GetRoomQuota(room: RoomExtra) { return 8; }
  IsSpawnNeeded(_room: RoomExtra) { return true; }

  SelectNextTask(creep: CreepExtra, room: RoomExtra): CreepTask {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
      return this.FindGatheringTask(creep, room);
    else if (room.find(FIND_HOSTILE_CREEPS).length > 0)
      return this.FindWartimeSpendingTask(creep, room);
    else
      return this.FindSpendingTask(creep, room);
  }

  ControllerMaintenanceTask(room: RoomExtra): CreepTask | undefined {
    return room.controller && room.controller.my ? new MaintainController(room.controller.id) : undefined;
  }

  ControllerUpgradeTask(room: RoomExtra): CreepTask | undefined {
    return room.controller && room.controller.my ? new UpdateController(room.controller.id) : undefined;
  }

  CurrentAssignedTasks(room: RoomExtra): CreepTask[] {
    return room.AssignedCreeps
      .filter(c => c.memory.role.startsWith("Worker"))
      .map(c => c.currentTask ?? new Idle());
  }

  FindWartimeSpendingTask(creep: CreepExtra, room: RoomExtra): CreepTask {
    const spawnNeedingEnergy = this.FindSupplyByPriorityAndPath(creep, room.SpawnsOrExtensions, room);
    if (spawnNeedingEnergy) return new Supply(spawnNeedingEnergy.id as Id<AnyStoreStructure>);

    const site = this.FindConstructionByPriorityAndPath(creep.pos, room);
    if (site) return new Build(site.id as Id<ConstructionSite<BuildableStructureConstant>>);

    const towerNeedingEnergy = this.FindSupplyByPriorityAndPath(creep, room.Towers, room);
    if (towerNeedingEnergy) return new Supply(towerNeedingEnergy.id as Id<AnyStoreStructure>);

    const damaged = this.FindIdealRepair(creep, room);
    if (damaged) return new Repair(damaged.id as Id<AnyStructure>);

    this.log.warn("No wartime spending tasks!");
    return new Idle();
  }

  FindSpendingTask(creep: CreepExtra, room: RoomExtra): CreepTask {
    if (
      this.ControllerMaintenanceTask(room)
      && room.controller?.ticksToDowngrade !== undefined
      && room.controller.ticksToDowngrade < UpdateController.MaintenanceThreshold
    ) return this.ControllerMaintenanceTask(room)!;

    const spawn = this.FindSupplyByPriorityAndPath(creep, [...room.SpawnsOrExtensions, ...room.Towers], room);
    if (spawn) return new Supply(spawn.id as Id<AnyStoreStructure>);

    const cons = this.FindConstructionByPriorityAndPath(creep.pos, room);
    if (cons) return new Build(cons.id as Id<ConstructionSite<BuildableStructureConstant>>);

    const currentRepairCount = room.GetAssignedTasks(TaskAction.Repair).length;
    if (currentRepairCount < this.MaxRepairPerRoom) {
      const repair = this.FindIdealRepairByStrength(room);
      if (repair) return new Repair(repair.id as Id<AnyStructure>);
      else this.log.info(`[${room.name}]${creep}: No repairs needed!`);
    }

    const totalContainerCapacity = room.Containers.reduce(
      (sum, c) => sum + c.store.getCapacity(RESOURCE_ENERGY),
      0,
    );
    if (room.storage && totalContainerCapacity > 0) {
      const totalContainerEnergy = room.Containers.reduce(
        (sum, c) => sum + c.store.getUsedCapacity(RESOURCE_ENERGY),
        0,
      );
      const totalFillRatio = totalContainerEnergy / totalContainerCapacity;
      if (totalFillRatio > 0.5) return new Supply(room.storage.id as Id<AnyStoreStructure>);
    }

    const upgradeTask = this.ControllerUpgradeTask(room);
    if (upgradeTask) return upgradeTask;

    this.log.warn("No spending tasks found!");
    return new Idle();
  }

  FindDroppedEnergy(creep: CreepExtra, room: RoomExtra): CreepTask | null {
    const droppedResources = room.find(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY });
    for (const res of droppedResources) {
      const countPickingUpSameRes = this.CurrentAssignedTasks(room).filter(
        t => t.action === TaskAction.Pickup && "target" in t && t.target === res.id,
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

  FindGatheringTask(creep: CreepExtra, room: RoomExtra): CreepTask {
    const dropped = this.FindDroppedEnergy(creep, room);
    if (dropped) return dropped;

    const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
      ignoreCreeps: true,
      filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0,
    });
    if (container) return new CollectEnergy({ kind: "container", id: container.id as Id<StructureContainer> }, { maxAttempts: 3 });

    const miners = room.AssignedCreepsByRoleGroup.get("Miners") ?? [];
    if (miners.length === 0) {
      const source = this.FindLeastAssignedSource(room);
      if (source) return new Mine(source.id);
    } else {
      const bestMiner = miners.filter(m => m.store.getUsedCapacity(RESOURCE_ENERGY)).sort((a, b) => a.store.getUsedCapacity(RESOURCE_ENERGY) - b.store.getUsedCapacity(RESOURCE_ENERGY)).pop();
      if (bestMiner) return new CollectEnergy(bestMiner.name, { maxAttempts: 5 });
    }

    // this.log.info(`FindGatheringTask no tasks found!`, { "<creep>": creep });
    return new Idle();
  }

  MaxRepairPerRoom = 1;
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

  FindConstructionByPriorityAndPath(pos: RoomPosition, room: RoomExtra): ConstructionSite | null {
    const constructions = room.find(FIND_MY_CONSTRUCTION_SITES);
    for (const p of this.ConstructionPriorities) {
      const group = constructions.filter(p);
      if (group.length) return pos.findClosestByPath(group, { ignoreCreeps: true });
    }
    return null;
  }

  FindSupplyByPriorityAndPath(supplier: CreepExtra, candidates: AnyStoreStructure[], room: RoomExtra): AnyStoreStructure | null {
    const inProgressSupplyTasks = this.CurrentAssignedTasks(room).filter(t => t.action === TaskAction.Supply);
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

  FindIdealRepairByStrength(room: RoomExtra): AnyStructure | undefined | null {
    const inProgressRepairTasks = this.CurrentAssignedTasks(room).filter(t => t.action === TaskAction.Repair);
    const targetsByCount = new Map<string, number>();
    for (const t of inProgressRepairTasks) {
      const target = "target" in t ? (t.target as string | undefined) : undefined;
      if (!target) continue;
      const existing = targetsByCount.get(target) ?? 0;
      targetsByCount.set(target, existing + 1);
    }

    const repairs = room.find(FIND_STRUCTURES, { filter: s => s.hits < s.hitsMax });
    for (const [p, repairAt, maxRepairs] of room.RepairPriorities) {
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

  FindIdealRepair(supplier: CreepExtra, room: RoomExtra): AnyStructure | undefined | null {
    const inProgressRepairTasks = this.CurrentAssignedTasks(room).filter(t => t.action === TaskAction.Repair);
    const targetsByCount = new Map<string, number>();
    for (const t of inProgressRepairTasks) {
      const target = "target" in t ? (t.target as string | undefined) : undefined;
      if (!target) continue;
      const existing = targetsByCount.get(target) ?? 0;
      targetsByCount.set(target, existing + 1);
    }

    const repairs = room.find(FIND_STRUCTURES, { filter: s => s.hits < s.hitsMax });
    for (const [p, repairAt, maxRepairs] of room.RepairPriorities) {
      const needsRepair = repairs
        .map(s => ({ site: s, count: targetsByCount.get(s.id) ?? 0 }))
        .filter(s => p(s.site) && (s.site.hits / s.site.hitsMax) < repairAt && s.count < maxRepairs)
        .map(c => c.site);

      if (needsRepair.length > 0) return supplier.pos.findClosestByPath(needsRepair, { ignoreCreeps: true });
    }

    return null;
  }

  FindLeastAssignedSource(room: RoomExtra): Source | undefined {
    const sourceToAssigneeCount = new Map<Id<Source>, number>();
    for (const t of room.GetAssignedTasks().filter(t => t instanceof Mine)) {
      const sourceId = (t as Mine).target;
      sourceToAssigneeCount.set(sourceId, (sourceToAssigneeCount.get(sourceId) ?? 0) + 1);
    }
    return room.Sources
      .map(source => ({ source, count: sourceToAssigneeCount.get(source.id) ?? 0 }))
      .sort((b, a) => a.count - b.count)
      .pop()?.source;
  }
}
