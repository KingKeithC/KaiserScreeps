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

  // Roughly 1 worker per 4 structures
  GetGlobalQuota(): number {
    return Math.ceil(Object.values(Game.structures)
      .filter((s: any): s is AnyStoreStructure => s.my).length / 4);
  }

  override GetRoomQuota(room: RoomExtra) { return -1; }
  IsSpawnNeeded(_room: RoomExtra) { return true; }

  SelectNextTask(creep: CreepExtra): CreepTask | null {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
      return this.FindGatheringTask(creep);
    else if (creep.AssignedRoom.Hostiles.length > 0)
      return this.FindWartimeSpendingTask(creep);
    else
      return this.FindSpendingTask(creep);
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

  MaxUpgraders = 3;
  public FindSpendingTask(creep: CreepExtra): CreepTask {
    if (creep.AssignedRoom.controller) {
      const downgradeMaintenanceThreshold = CONTROLLER_DOWNGRADE[creep.AssignedRoom.controller.level] * UpdateController.DowngradeMaintenanceRatio;
      if (creep.AssignedRoom.controller.ticksToDowngrade < downgradeMaintenanceThreshold)
        return new MaintainController(creep.AssignedRoom.controller);
    }

    const spawn = this.FindSupplyByPriorityAndPath(creep, [...MySpawnsOrExtensions(), ...MyTowers()]);
    if (spawn) return new Supply(spawn.id as Id<AnyStoreStructure>);

    const cons = this.FindConstructionByPriorityAndPath(creep, MyConstructionSites());
    if (cons) return new Build(cons.id as Id<ConstructionSite<BuildableStructureConstant>>);

    // If there are no towers in this room
    const currentRepairs = creep.AssignedRoom.GetAssignedTasks(TaskAction.Repair) as Repair[];
    if (MyTowers().filter(t => t.pos.roomName === creep.pos.roomName).length === 0) {
      if (currentRepairs.filter(r => r.repairRoom === creep.pos.roomName).length < this.MaxRepairPerRoom) {
        const repair = this.FindIdealRepairByStrength(creep.AssignedRoom);
        if (repair) return new Repair(repair);
        else this.log.info(`[${creep.AssignedRoom.name}]${creep}: No repairs needed!`);
      }
    }

    const currentUpgradeCount = creep.AssignedRoom.GetAssignedTasks(TaskAction.UpgradeController).length;
    if (currentUpgradeCount < this.MaxUpgraders) {
      return new UpdateController(creep.AssignedRoom.controller!, { mode: "upgrade" });
    }

    // If room has storage with room, put it there
    if (creep.AssignedRoom.storage && creep.AssignedRoom.storage.store.getFreeCapacity(RESOURCE_ENERGY))
      return new Supply(creep.AssignedRoom.storage.id as Id<AnyStoreStructure>);

    this.log.warn("No spending tasks found!");
    return new Idle();
  }

  FindDroppedEnergy(creep: CreepExtra): CreepTask | null {
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

  ContainerAmountNeededToTake = 50;
  MaxIncomingPerContaininer = 2;
  MaxIncomingPerMiner = 2;
  FindGatheringTask(creep: CreepExtra): CreepTask | null {
    const dropped = this.FindDroppedEnergy(creep);
    if (dropped) return dropped;

    const activeDeliveries = creep.AssignedRoom.GetAssignedTasks(TaskAction.CollectEnergy) as CollectEnergy[];
    const containerOrLinkReciever = creep.pos.findClosestByPath([
      ...creep.AssignedRoom.Containers,
      ...creep.AssignedRoom.LinkReceivers,
    ], {
      ignoreCreeps: true,
      filter: s => {
        const incoming = activeDeliveries.filter(ad => (
          ad.source.kind === "container" && ad.source.id === s.id)
          || (ad.source.kind === "link" && ad.source.id === s.id)
        );

        if (incoming.length > this.MaxIncomingPerContaininer) return false;
        return s.store.getUsedCapacity(RESOURCE_ENERGY) > this.ContainerAmountNeededToTake;
      }
    });
    if (containerOrLinkReciever) {
      if (containerOrLinkReciever instanceof StructureContainer) return new CollectEnergy({ kind: "container", id: containerOrLinkReciever.id as Id<StructureContainer> }, { maxAttempts: 3 });
      return new CollectEnergy({ kind: "link", id: containerOrLinkReciever.id as Id<StructureLink> }, { maxAttempts: 3 });
    }

    const miners = creep.AssignedRoom.AssignedCreepsByRoleGroup.get("Miners") ?? [];
    if (miners.length > 0) {
      // Collect energy from a dedicated miner
      const bestMiner = miners
        .filter(m => {
          const incoming = activeDeliveries.filter(ad => (ad.source.kind === "creep" && ad.source.name === m.name));
          if (incoming.length > this.MaxIncomingPerMiner) return false;
          return m.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
        })
        .sort((a, b) => a.store.getUsedCapacity(RESOURCE_ENERGY) - b.store.getUsedCapacity(RESOURCE_ENERGY))
        .pop();
      if (bestMiner) return new CollectEnergy(bestMiner.name, { maxAttempts: 8 });
    } else {
      // Do mining on our own
      const source = creep.AssignedRoom.GetUnfilledUnassignedMiningPositions().pop();
      if (source) return new Mine(source);
    }

    if (creep.AssignedRoom.storage && creep.AssignedRoom.storage.store.getUsedCapacity(RESOURCE_ENERGY) > creep.AssignedRoom.StorageWartimeEnergyBuffer)
      return new CollectEnergy({ kind: "storage", id: creep.AssignedRoom.storage.id });

    this.log.info(`FindGatheringTask no tasks found!`, { "<creep>": creep });
    return null;
  }

  MaxRepairPerRoom = 3;
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
