import { CreepExtra } from "Creep";
import { RoomExtra } from "Room";
import { Build, CollectEnergy, CreepTask, MaintainController, Mine, Repair, Supply, TaskAction, UpdateController } from "tasks";
import { MakeBody, MyConstructionSites, MySpawnsOrExtensions, MyTowers } from "utils/Collections";
import { BodyCost } from "utils/CreepUtils";
import { CreepRoleBase, CreepRole } from "./Role";

export class Worker extends CreepRoleBase implements CreepRole {
  readonly groupName = "Workers";
  readonly name: string = "Worker";

  GetNewCreepBody(room: RoomExtra): BodyPartConstant[] {
    const tiers = [
      // MakeBody([WORK, 11], [CARRY, 6], [MOVE, 8]), // 1800
      MakeBody([WORK, 6], [CARRY, 7], [MOVE, 7]),  // 1300
      MakeBody([WORK, 2], [CARRY, 4], [MOVE, 3]),  // 550
    ];

    const measure = room.AssignedCreeps.length < 3 ? room.energyAvailable : room.energyCapacityAvailable;
    for (const t of tiers)
      if (BodyCost(t) <= measure)
        return t; // Return the first body we can currently afford

    return MakeBody([CARRY, 2], [WORK, 1], [MOVE, 2]); // 300, Zygote
  }

  TickCreep(creep: CreepExtra): void {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      // If we run across a tombstone containing energy, pick it up
      const tomb = creep.pos.findInRange(FIND_TOMBSTONES, 1, { filter: t => t.store.getUsedCapacity(RESOURCE_ENERGY) > 0 });
      for (const t of tomb) creep.withdraw(t, RESOURCE_ENERGY);

      // If there is energy next to us, pick it up
      const dropped = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, { filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 0 });
      for (const d of dropped) creep.pickup(d);
    }
  }

  // 4 workers per mine
  override GetRoomQuota(room: RoomExtra) { return room.MaxMiners * 4; }

  IsSpawnNeeded() { return true; }

  GetInitialTask(): CreepTask<string> | null { return null; }
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

  MaxUpgraders = 2;
  MaxSupplyForSpawns = 3;
  MaxSupplyForTowers = 2;
  MaxRepairPerRoom = 2;
  public FindSpendingTask(creep: CreepExtra): CreepTask | null {
    if (creep.AssignedRoom.controller) {
      const downgradeMaintenanceThreshold = CONTROLLER_DOWNGRADE[creep.AssignedRoom.controller.level] * UpdateController.DowngradeMaintenanceRatio;
      if (creep.AssignedRoom.controller.ticksToDowngrade < downgradeMaintenanceThreshold)
        return new MaintainController(creep.AssignedRoom.controller);
    }

    const supplyTasks = creep.AssignedRoom.GetAssignedTasks(TaskAction.Supply) as Supply[];
    const spawnsExtensions = MySpawnsOrExtensions();
    const existingSpawnExtensionSupplyTasks = supplyTasks.filter(st => spawnsExtensions.some(se => se.id === st.target));

    if (existingSpawnExtensionSupplyTasks.length < this.MaxSupplyForSpawns) {
      const spawn = this.FindSupplyByPath(creep, spawnsExtensions);
      if (spawn) return new Supply(spawn.id);
    }

    const cons = this.FindConstructionByPriorityAndPath(creep, MyConstructionSites());
    if (cons) return new Build(cons.id);

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
        const tower = this.FindSupplyByPath(creep, towers);
        if (tower) return new Supply(tower.id);
      }
    }

    const currentUpgradeCount = creep.AssignedRoom.GetAssignedTasks(TaskAction.UpgradeController).length;
    if (currentUpgradeCount < this.MaxUpgraders) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return new UpdateController(creep.AssignedRoom.controller!, { mode: "upgrade" });
    }

    // If room has storage with room, put it there
    if (creep.AssignedRoom.storage && creep.AssignedRoom.storage.store.getFreeCapacity(RESOURCE_ENERGY))
      return new Supply(creep.AssignedRoom.storage.id as Id<AnyStoreStructure>);

    // this.log.warn("No spending tasks found!");
    return null;
  }

  MinUsedCapacityPerNonCreepSource = 150;
  MaxIncomingPerEnergySource = 2;
  MaxIncomingPerContainer = 4;
  FindGatheringTask(creep: CreepExtra): CreepTask | null {
    const activeDeliveries = creep.AssignedRoom.GetAssignedTasks(TaskAction.CollectEnergy) as CollectEnergy[];
    const miners = (creep.AssignedRoom.AssignedCreepsByRoleGroup.get("Miners") ?? []).filter(m => !m.spawning);
    const possibleSources: (CreepExtra | StructureLink | StructureStorage | StructureContainer | Resource<RESOURCE_ENERGY> | Ruin)[] = [];

    for (const possible of [
      /* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
      ...creep.AssignedRoom.MapRoomsInClaimedArea(cr => cr.find(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY })) as Resource<RESOURCE_ENERGY>[],
      ...creep.AssignedRoom.MapRoomsInClaimedArea(cr => cr.find(FIND_RUINS)) as Ruin[],
      ...creep.AssignedRoom.MapRoomsInClaimedArea(cr => cr.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER })) as StructureContainer[],
      ...creep.AssignedRoom.LinkReceivers as StructureLink[],
      ...(creep.AssignedRoom.storage !== undefined ? [creep.AssignedRoom.storage] : []),
      ...miners,
      /* eslint-enable @typescript-eslint/no-unnecessary-type-assertion */
    ]) {

      // Skip Energy sources that have too little energy
      if (
        (possible instanceof Resource && possible.amount < this.IgnoreDroppedResourcesLessThan) // Skip resources that are too small
        || (possible instanceof CreepExtra && possible.store.getFreeCapacity(RESOURCE_ENERGY) !== 0) // Skip miners that aren't full
        || (!(possible instanceof Resource) && !(possible instanceof CreepExtra) && !(possible instanceof Creep)
          && possible.store.getUsedCapacity(RESOURCE_ENERGY) < this.MinUsedCapacityPerNonCreepSource) // Skip other stores that are not full enough
      ) {
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

      } else if (possible instanceof Resource && possible.resourceType === RESOURCE_ENERGY) {
        // Skip source if it has too many incoming deliveries already
        if (activeDeliveries.filter(ad => ad.source.kind === "dropped" && ad.source.id === possible.id).length > this.MaxIncomingPerEnergySource) {
          // this.log.info(`!Possibility: Resource: too many incoming deliveries already`);
          continue;
        }

        // Calculate amount remaining by time we get there:
        // const path = creep.pos.findPathTo(res, { ignoreCreeps: true });
        // const distance = path.length;
        // const approxAmtRemaining = Math.ceil(res.amount / 1000) * distance;
        // const collect = approxAmtRemaining > this.IgnoreDroppedResourcesLessThan;
        // this.log.debug(`${collect ? "Collecting" : "Ignoring"} Dropped ${res} that is ${distance} steps away, currently has ${res.amount} remaining, we expect ${approxAmtRemaining} by the time we get there.`);

      } else if (possible instanceof Ruin) {
        // Skip source if it has too many incoming deliveries already
        if (activeDeliveries.filter(ad => ad.source.kind === "ruin" && ad.source.id === possible.id).length > this.MaxIncomingPerEnergySource) {
          // this.log.info(`!Possibility: Ruin: too many incoming deliveries already`);
          continue;
        }

      } else if (possible instanceof StructureContainer) {
        // Skip source if it has too many incoming deliveries already
        if (activeDeliveries.filter(ad => ad.source.kind === "container" && ad.source.id === possible.id).length > this.MaxIncomingPerContainer) {
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
        this.log.warn(`Unknown Energy Possibility: ${possible}`);
        continue;
      }

      // this.log.info(`Possibility: ${possible}`);
      possibleSources.push(possible);
    }

    if (possibleSources.length === 0) return null; // Nothing more to do

    const amountMapper = (a: Resource | { store: StoreDefinition; }) => (a instanceof Resource ? a.amount : a.store.getUsedCapacity(RESOURCE_ENERGY));
    const target = possibleSources.sort((b, a) => amountMapper(a) - amountMapper(b))[0];

    // this.log.info(`Worker narrowed: '${possibleSources.map(ps => ps.id)}' down to ${target}`);

    if (target instanceof StructureContainer) return new CollectEnergy({ kind: "container", id: target.id }, { maxAttempts: 3 });
    else if (target instanceof StructureLink) return new CollectEnergy({ kind: "link", id: target.id }, { maxAttempts: 3 });
    else if (target instanceof StructureStorage) return new CollectEnergy({ kind: "storage", id: target.id }, { maxAttempts: 3 });
    else if (target instanceof Creep || target instanceof CreepExtra) return new CollectEnergy({ kind: "creep", name: target.name }, { maxAttempts: 8 });
    else if (target instanceof Ruin) return new CollectEnergy({ kind: "ruin", id: target.id }, { maxAttempts: 3 });
    else if (target instanceof Resource) return new CollectEnergy({ kind: "dropped", id: target.id }, { maxAttempts: 3 });
    else if (miners.length === 0) {
      this.log.warn(`Emergency mining since no miners are available...`);
      const source = creep.AssignedRoom.AvailableMiningPositions().pop();
      if (source) return new Mine(source);
    } else if (target === null || target === undefined)
      throw new Error(`We only sorted the target ${target}, yet seem to have lost it.`);

    this.log.warn(`FindGatheringTask no tasks found!`, { "<creep>": creep });
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
    (() => true),
  ];

  SupplyPriorities: [((s: AnyStoreStructure) => boolean), number][] = [
    [(s => s instanceof StructureExtension), 1],
    [(s => s instanceof StructureSpawn), 1],
    [(s => s instanceof StructureTower), 1],
    [(() => true), 1],
  ];

  FindConstructionByPriorityAndPath(creep: CreepExtra, candidates: ConstructionSite[] = creep.AssignedRoom.ConstructionSites): ConstructionSite | null {
    for (const p of this.ConstructionPriorities) {
      const group = candidates.filter(p);
      if (group.length) return creep.pos.findClosestByPath(group, { ignoreCreeps: true });
    }
    return null;
  }

  FindSupplyByPath(supplier: CreepExtra, candidates: AnyStoreStructure[]): AnyStoreStructure | null {
    const inProgressSupplyTasks = supplier.AssignedRoom.GetAssignedTasks(TaskAction.Supply) as Supply[];
    let considered = 0;
    let groups = 0;
    for (const [p, maxSuppliers] of this.SupplyPriorities) {
      const group = candidates
        .map(s => ({ structure: s, suppliers: inProgressSupplyTasks.filter(ist => ist.target === s.id).length }))
        .filter(s => s.structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && p(s.structure) && s.suppliers < maxSuppliers)
        .map(s => s.structure);
      considered += group.length;

      const sameRoom = supplier.pos
        .findClosestByPath(group.filter(s => s.room.name === supplier.room.name), { ignoreCreeps: true });
      if (sameRoom) return sameRoom;

      const remoteRoom = group
        .filter(s => s.room.name !== supplier.room.name)
        .sort((a, b) => (a.store.getUsedCapacity(RESOURCE_ENERGY) / a.store.getCapacity(RESOURCE_ENERGY)) - (b.store.getUsedCapacity(RESOURCE_ENERGY) / b.store.getCapacity(RESOURCE_ENERGY)))
        .pop();
      if (remoteRoom) return remoteRoom;
      groups++;
    }

    this.log.info(`Nothing needs supply. Considered ${considered} eligible objects across ${groups} groups.`);
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
