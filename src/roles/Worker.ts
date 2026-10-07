import { CreepExtra } from "Creep";
import { RoomRole } from "./Role";

enum WorkerAction {
  Idle = '💤',
  Mine = '⛏️',
  CollectEnergy = '🔌',
  MaintainController = '🦸‍♀️',
  Build = '🏗️',
  Repair = '🛠️',
  Supply = '🫴',
  UpgradeController = '🔼',
  Pickup = "🧹"
}

type WorkerTarget = Id<ConstructionSite<BuildableStructureConstant> | AnyStructure | Source | Creep | Resource<RESOURCE_ENERGY> | StructureContainer>

class WorkerTask extends Object {
  readonly action: WorkerAction;
  readonly target: WorkerTarget | null;

  constructor(action: WorkerAction, id?: WorkerTarget) {
    super();

    this.action = action;
    this.target = id ? id : null;
    if ((!id) && action !== WorkerAction.Idle) {
      throw new Error(`Id was ${id} with a non idle action: ${action}`);
    }
  }

  equals(other: WorkerTask) {
    return this.action === other.action && this.target == other.target;
  }
}

export class WorkerI extends RoomRole<WorkerTask> {
  static readonly RoleName: string = "WorkerI";
  InitialJobMemory = new WorkerTask(WorkerAction.Idle);

  StartSpawnAtRCL = 0;
  StopSpawnAtRCL = 4;
  BodyParts = [WORK, CARRY, MOVE];

  // Up to 6, less one for each WorkerII that is spawned.
  get CountPerRoom() {
    const max = 6;
    const T2 = Object.values(Game.creeps).filter(c => c.memory.room === this.manager.name && c.memory.role === 'WorkerII').length;
    return max - T2 <= 0 ? 0 : max - T2;
  }

  ControllerMaintenanceThreshold = 1000; // Start upgrading when ticksToDowngrade is less than this.
  ControllerMaintenanceBuffer = 2000;    // Stop upgrading when ticksToDowngrade is greater than `ControllerMaintenanceThreshold+ControllerMaintenanceBuffer`.

  MaxSupplyPerTarget = 1;
  SupplyPriorities: ((s: AnyStoreStructure) => boolean)[] = [
    (s => s instanceof StructureExtension || s instanceof StructureSpawn),
    (s => s instanceof StructureTower),
    (_ => true),
  ];

  RepairDamageRatio = 0.5
  MaxRepairPerTarget = 1;
  RepairPriorities: ((s: AnyStructure) => boolean)[] = [
    (s => s instanceof StructureWall || s instanceof StructureRampart),
    (_ => true),
  ];

  // At least 2, but no more than 1/4 of the number of sites
  get MaxConstructionWorkers() {
    const max = Math.floor(this.manager.ConstructionSites.length / 4);
    const min = 2;
    return max < min ? min : max;
  };
  ConstructionPriorities: ((c: ConstructionSite) => boolean)[] = [
    (c => c.structureType === STRUCTURE_EXTENSION || c.structureType === STRUCTURE_SPAWN),
    (c => c.structureType === STRUCTURE_STORAGE || c.structureType === STRUCTURE_CONTAINER),
    (c => c.structureType === STRUCTURE_ROAD),
    (c => c.structureType === STRUCTURE_RAMPART || c.structureType === STRUCTURE_WALL),
    (_ => true),
  ];

  IgnoreDroppedResourcesLessThan = 30;

  MediumSearchRange = 20;
  ShortSearchRange = 5;

  TickCreep(creep: CreepExtra, currentTask: WorkerTask): void {
    if (this.IsTaskComplete(creep, currentTask)) {
      const newTask = this.Reassign(creep);
      console.log(`${this.manager.room} Reassigned ${creep.name.padEnd(30)} ${JSON.stringify(currentTask)} -> ${JSON.stringify(newTask)}`);
      this.manager.room.memory.recentEvents?.push({
        time: Game.time,
        event: `Worker Reassign ${currentTask.action} -> ${newTask.action}`,
        summary: `Worker Reassign ${currentTask.action} -> ${newTask.action}`,
        value: null,
      });
      creep.say(newTask.action);
      creep.memory.jobMemory = newTask;
    }
    this.Act(creep, currentTask);
  }

  Reassign(creep: CreepExtra): WorkerTask {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
      return this.FindGatheringTask(creep);
    else if (this.manager.HostileCreeps.length > 0)
      return this.FindWartimeSpendingTask(creep);
    else
      return this.FindSpendingTask(creep);
  }

  ControllerMaintenanceTask?: WorkerTask = this.manager.controller?.my == true
    ? new WorkerTask(WorkerAction.MaintainController, this.manager.controller.id)
    : undefined;

  ControllerUpgradeTask?: WorkerTask = this.manager.controller?.my == true
    ? new WorkerTask(WorkerAction.UpgradeController, this.manager.controller.id)
    : undefined;

  get CurrentlyAssignedTasks(): WorkerTask[] {
    return this.manager.room.find(FIND_MY_CREEPS, {
      filter: c => c.memory.role.startsWith("Worker")
    }).map(c => c.memory.jobMemory as WorkerTask);
  }

  private _WorkersByActionAndTarget?: Map<WorkerAction, Map<WorkerTarget, CreepExtra[]>>;
  get WorkersByActionAndTarget(): Map<WorkerAction, Map<WorkerTarget, CreepExtra[]>> {
    // Return cached
    if (this._WorkersByActionAndTarget != undefined) return this._WorkersByActionAndTarget;

    // Generate cache and return
    const res = new Map<WorkerAction, Map<WorkerTarget, CreepExtra[]>>();
    for (const worker of this.manager.room.find(FIND_MY_CREEPS, {
      filter: c => c.memory.role.startsWith("Worker")
    })) {
      const task = worker.memory.jobMemory as WorkerTask;
      if (task.action === WorkerAction.Idle) continue;
      const actionGroup = res.get(task.action) ?? new Map();
      const targetWorkers = [...(actionGroup.get(task.target) ?? []), worker];
      actionGroup.set(task.target, targetWorkers);
      res.set(task.action, actionGroup);
    }

    this._WorkersByActionAndTarget = res;
    return this._WorkersByActionAndTarget;
  }

  private _WorkersByAction?: Map<WorkerAction, CreepExtra[]>;
  get WorkersByAction(): Map<WorkerAction, CreepExtra[]> {
    // Return cached
    if (this._WorkersByAction != undefined) return this._WorkersByAction;

    // Generate cache and return
    const res = new Map();
    for (const [action, workersBytarget] of this.WorkersByActionAndTarget.entries())
      for (const [target, workers] of workersBytarget.entries())
        res.set(action, [...res.get(action) ?? [], ...workers]);

    this._WorkersByAction = res;
    return this._WorkersByAction;
  }

  WorkerActionCount(action: WorkerAction): number { return (this.WorkersByAction.get(action) ?? []).length; }

  FindWartimeSpendingTask(creep: CreepExtra): WorkerTask {
    // Spawns/Extensions needing energy
    const spawnNeedingEnergy = this.FindClosestNeedsSupply(creep.pos, this.manager.SpawnsOrExtensions);
    if (spawnNeedingEnergy) return new WorkerTask(WorkerAction.Supply, spawnNeedingEnergy.id);

    // Ongoing Construction
    const site = this.FindClosestConstructionByPriority(creep.pos);
    if (site) return new WorkerTask(WorkerAction.Build, site.id);

    // Tower needing energy
    const towerNeedingEnergy = this.FindClosestNeedsSupply(creep.pos, this.manager.SpawnsOrExtensions);
    if (towerNeedingEnergy) return new WorkerTask(WorkerAction.Supply, towerNeedingEnergy.id);

    // Structures in need of repair
    const delapitated = this.manager.FindRepairByPriority();
    if (delapitated) return new WorkerTask(WorkerAction.Repair, delapitated.id);

    // Default
    return new WorkerTask(WorkerAction.Idle);
  }

  FindSpendingTask(creep: CreepExtra): WorkerTask {
    // Select target in order of priority

    // Controller at risk of downgrade
    if (
      this.ControllerMaintenanceTask
      && this.manager.controller!.ticksToDowngrade < this.ControllerMaintenanceThreshold
    ) return this.ControllerMaintenanceTask;

    // Find nearest unsupplied Spawn/Extension, regardless of worker count
    const spawn = this.FindUnsuppliedSupplyTarget(creep, this.manager.SpawnsOrExtensions);
    if (spawn) return new WorkerTask(WorkerAction.Supply, spawn.id);

    // If not enough construction workers, find closest site
    const cons = this.FindClosestConstructionByPriority(creep.pos);
    if (cons) return new WorkerTask(WorkerAction.Build, cons.id);

    // If not enough suppliers, find nearest unsupplied Tower
    const tower = this.FindUnsuppliedSupplyTarget(creep, this.manager.Towers);
    if (tower) return new WorkerTask(WorkerAction.Supply, tower.id);

    // If not enough repair workers, find nearest repair
    const repair = this.FindUnsuppliedRepair(creep);
    if (repair) return new WorkerTask(WorkerAction.Repair, repair.id);
    else console.log(`[${this.manager.name}]${creep}: No repairs needed!`);

    // Nothing else to do so just upgrade forever
    if (this.ControllerUpgradeTask) return this.ControllerUpgradeTask;

    // Default
    return new WorkerTask(WorkerAction.Idle);
  }

  FindGatheringTask(creep: CreepExtra): WorkerTask {
    // Dropped Energy with reasonable amount remaining
    for (const res of this.manager.room.find(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > this.IgnoreDroppedResourcesLessThan })) {
      const countPickingUpSameRes = this.CurrentlyAssignedTasks.filter(t => t.action === WorkerAction.Pickup && t.target == res.id).length;
      if (!countPickingUpSameRes) return new WorkerTask(WorkerAction.Pickup, res.id as Id<Resource<RESOURCE_ENERGY>>);
    }

    // Collect from the nearest container that has energy
    const container = creep.pos.findClosestByPath(this.manager.Containers.filter(s => s.store.getUsedCapacity(RESOURCE_ENERGY)), { ignoreCreeps: true });
    if (container) return new WorkerTask(WorkerAction.CollectEnergy, container.id);

    // Collect from the fullest miner in medium range
    const miners = creep.pos.findInRange(
      (this.manager.CreepsByRole.get("Miner") ?? []).filter(m => m.store.getUsedCapacity(RESOURCE_ENERGY)),
      this.MediumSearchRange
    ).sort((a, b) => a.store.energy - b.store.energy).pop();
    if (miners) return new WorkerTask(WorkerAction.CollectEnergy, miners.id);

    // Do harvesting on our own
    const source = this.FindLeastAssignedSource();
    if (source) return new WorkerTask(WorkerAction.Mine, source.id);

    // Nothing to do without energy
    return new WorkerTask(WorkerAction.Idle);
  }

  FindClosestConstructionByPriority(pos: RoomPosition): ConstructionSite | null {
    const constructions = this.manager.room.find(FIND_MY_CONSTRUCTION_SITES);
    const constructionsByPriority = [];

    for (const p of this.ConstructionPriorities)
      constructionsByPriority.push(constructions.filter(p))

    for (const p of constructionsByPriority)
      if (p.length) return pos.findClosestByPath(p, { ignoreCreeps: true });

    return null;
  }

  // Return the closest Spawn/Extension/Tower with room for energy
  FindClosestNeedsSupply(pos: RoomPosition, candidates: AnyStoreStructure[]): AnyStoreStructure | null {
    return pos.findClosestByPath(candidates, { ignoreCreeps: true, filter: s => s.store.getFreeCapacity(RESOURCE_ENERGY) });
  }

  // Return the closest Spawn/Extension/Tower with room for energy
  // and the least number of other assigned suppliers
  FindUnsuppliedSupplyTarget(supplier: CreepExtra, candidates: AnyStoreStructure[]): AnyStoreStructure | null {
    // Get all transfers in progress
    const inProgressSupplyTasks = this.CurrentlyAssignedTasks.filter(t => t.action === WorkerAction.Supply);

    // Group by target and return count of group
    const supplyTargetsByCount = new Map();
    for (const t of inProgressSupplyTasks) {
      const existing = supplyTargetsByCount.get(t.target!) ?? 0;
      supplyTargetsByCount.set(t.target!, existing + 1);
    }

    // Get candidates and group by number of suppliers
    const needsSupply = candidates
      .filter(s => s.store.getFreeCapacity(RESOURCE_ENERGY))
      .map(s => ({ store: s, transferCount: supplyTargetsByCount.get(s.id) ?? 0 }))
      .filter(s => s.transferCount < this.MaxSupplyPerTarget)
      .map(s => s.store);

    return supplier.pos.findClosestByPath(needsSupply, { ignoreCreeps: true });
  }

  FindUnsuppliedRepair(supplier: CreepExtra): AnyStructure | undefined {
    const inProgressRepairTasks = this.CurrentlyAssignedTasks.filter(t => t.action === WorkerAction.Repair);

    // Group by target and return count of group
    const targetsByCount = new Map();
    for (const t of inProgressRepairTasks) {
      const existing = targetsByCount.get(t.target!) ?? 0;
      targetsByCount.set(t.target!, existing + 1);
    }

    // Get candidates and group by number of suppliers
    const needsRepair = this.manager.room.find(FIND_STRUCTURES, { filter: s => (s.hits / s.hitsMax) < this.RepairDamageRatio })
      .map(s => ({ site: s, count: targetsByCount.get(s.id) ?? 0 }))
      .filter(s => s.count < this.MaxRepairPerTarget)
      .sort((b, a) => a.count - b.count)
      .map(c => c.site);

    if (needsRepair.length === 0) console.log("No unsupplied repairs found.");
    return supplier.pos.findClosestByPath(needsRepair, { ignoreCreeps: true }) ?? undefined;
  }

  FindLeastAssignedSource(): Source | undefined {
    const harvestersBySource = new Map<Id<Source>, number>();
    for (const c of [
      ...this.manager.CreepsByRole.get("WorkerI") ?? [],
      ...this.manager.CreepsByRole.get("WorkerII") ?? [],
    ]) {
      const mem = c.memory.jobMemory as WorkerTask;
      if (!mem.target) continue;
      const obj = Game.getObjectById(mem.target);
      if (obj instanceof Source) harvestersBySource.set(obj.id, (harvestersBySource.get(obj.id) ?? 0) + 1)
    }
    return this.manager.Sources
      .map(source => ({ source, count: harvestersBySource.get(source.id) ?? 0 }))
      .sort((b, a) => a.count - b.count)
      .pop()?.source;
  }

  Act(creep: CreepExtra, task: WorkerTask): void {
    // Validate Target
    if (task.target == null || task.target == undefined) {
      // Target may be null in this one case
      if (task.action === WorkerAction.Idle) return;

      console.log(`[${this.manager.name}]${creep}: Act: ${creep} has null/undefined target in memory: ${task.target}`)
      return;
    }

    // Load object the target references
    const targetObject = Game.getObjectById(task.target);
    if (targetObject == null || targetObject == undefined) {

      // Finished a construction
      if (task.action === WorkerAction.Build) return;

      console.log(`[${this.manager.name}]${creep}: Act: ${creep} Game.getObjectById returned null`)
      return;
    }

    // Actually act on the target
    var result: number = OK;
    switch (task.action) {
      case (WorkerAction.Pickup): {
        const t = targetObject as Resource;
        result = creep.pickup(t)
        if (result === OK) console.log(`[${this.manager.name}]${creep}: Act: Picked up ${t}.`);
        break;
      }
      case (WorkerAction.CollectEnergy): {
        if (targetObject instanceof StructureContainer || targetObject instanceof Tombstone || targetObject instanceof Ruin) {
          result = creep.withdraw(targetObject, RESOURCE_ENERGY);
          // console.log(`[${this.manager.name}]${creep}: Withdrawing energy... (${t.store.energy}/${t.store.getCapacity(RESOURCE_ENERGY)} -> ${creep.store.energy}/${creep.store.getCapacity(RESOURCE_ENERGY)})`);
        } else if (targetObject instanceof Creep) {
          // console.log(`[${this.manager.name}]${creep}: Awaiting energy transfer (${creep.store.energy}/${creep.store.getCapacity(RESOURCE_ENERGY)}).`);
          result = ERR_NOT_IN_RANGE; // Forces them to move toward the Miner.
        } else {
          console.log(`[${this.manager.name}]${creep}: Unknown target for CollectEnergy: ${targetObject}`);
        }
        break;
      }
      case (WorkerAction.UpgradeController):
      case (WorkerAction.MaintainController): {
        const t = targetObject as StructureController;
        result = creep.upgradeController(t);
        // if (result === OK) console.log(`${this.room}${creep}: Act: Upgraded ${t} to RCL ${t.level} (${t.progress}/${t.progressTotal}) %${(t.progress / t.progressTotal * 100).toFixed(2)}.`);
        break;
      }
      case (WorkerAction.Build): {
        const t = targetObject as ConstructionSite;
        result = creep.build(t);
        // if (result === OK) console.log(`${this.room}${creep}: Act: Built ${t} (${t.progress}/${t.progressTotal}) %${(t.progress / t.progressTotal * 100).toFixed(2)}.`);
        break;
      }
      case (WorkerAction.Repair): {
        const t = targetObject as AnyOwnedStructure;
        result = creep.repair(t);
        // if (result === OK) console.log(`${this.room}${creep}: Act: Repaired ${t} (${t.hits}/${t.hitsMax}) %${(t.hits / t.hitsMax * 100).toFixed(2)}.`);
        break;
      }
      case (WorkerAction.Supply): {
        const t = targetObject as AnyStoreStructure;
        result = creep.transfer(t, RESOURCE_ENERGY);
        // if (result === OK) console.log(`${this.room}${creep}: Act: Supplied ${t}.`);
        break;
      }
      case (WorkerAction.Mine): {
        const t = targetObject as Source;
        result = creep.harvest(t)
        // if (result === OK) console.log(`${this.room}${creep}: Act: Mined ${t}.`);
        break;
      }
      default: {
        console.log(`[${this.manager.name}]${creep}: Act: Unknown Action ${JSON.stringify(task)}.`);
        break;
      }
    }

    // Handle errors

    switch (result) {
      case OK:
      case ERR_FULL:
      case ERR_NOT_ENOUGH_RESOURCES: {
        // These can be ignored.
        return;
      }
      case ERR_NOT_IN_RANGE: {
        // Determine how close we need to move to the target
        var minDistance = 3;
        if (
          task.action === WorkerAction.Mine
          || task.action === WorkerAction.Supply
          || task.action === WorkerAction.CollectEnergy
        )
          minDistance = 1;
        else if (task.action === WorkerAction.Pickup)
          minDistance = 0;

        // Move. Since this is our last action, ignore the RC.
        creep.MoveCreep(targetObject.pos, { range: minDistance });
        return;
      }
      default: {
        // Generic print all
        console.log(`[${this.manager.name}]${creep}: Act: Task ${JSON.stringify(task)} was not successful: ${result}`);
        return;
      }
    }
  }

  IsTaskComplete(creep: CreepExtra, task: WorkerTask): boolean {
    // Invalid/Idle tasks are always done.
    if (!task.target || !task.action || task.action === WorkerAction.Idle) return true;

    // Get the object the task references
    const targetObject = Game.getObjectById(task.target);
    if (!targetObject && task.action === WorkerAction.Build)
      return true; // Builders can have stale objects so don't log an error
    else if (!targetObject) {
      console.log(`[${this.manager.name}]${creep}: IsTaskComplete: Game.getObjectById of ${task.target} is null`);
      return true;
    }

    switch (task.action) {
      case (WorkerAction.Mine): {
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;
        return (targetObject as Source).energy === 0;
      }
      case (WorkerAction.CollectEnergy): {
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;
        if (targetObject instanceof StructureContainer) return targetObject.store.energy === 0;
        if (targetObject instanceof Creep) return targetObject.store.energy === 0;
        if (targetObject instanceof Resource && targetObject.resourceType === RESOURCE_ENERGY) return targetObject.amount > 0;

        console.log(`[${this.manager.name}]${creep}: Assuming collection is complete: ${targetObject}`);
        return true;
      }
      case (WorkerAction.Pickup): {
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;
        const t = targetObject as Resource<RESOURCE_ENERGY>;
        return t.amount === 0;
      }
      case (WorkerAction.UpgradeController): {
        return creep.store.energy === 0;
      }
      case (WorkerAction.MaintainController): {
        if (creep.store.energy === 0) return true;
        return this.manager.controller!.ticksToDowngrade > (this.ControllerMaintenanceThreshold + this.ControllerMaintenanceBuffer)
      }
      case (WorkerAction.Build): {
        if (creep.store.energy === 0) return true;
        const t = targetObject as ConstructionSite;
        return t.progress === t.progressTotal;
      }
      case (WorkerAction.Repair): {
        if (creep.store.energy === 0) return true;
        const t = targetObject as AnyOwnedStructure;
        return t.hits === t.hitsMax;
      }
      case (WorkerAction.Supply): {
        if (creep.store.energy === 0) return true;
        const t = targetObject as AnyStoreStructure;
        return t.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
      }
      default: {
        console.log(`[${this.manager.name}]${creep}: IsTaskComplete: Unknown Task is complete: ${JSON.stringify(task)}`);
        return true;
      }
    }
  }

  TickEnd(): void {
    // Draw visuals
    if (this.manager.memory.enableVisuals ?? true) {
      for (const t of this.CurrentlyAssignedTasks) {
        var colour = "#000000";
        switch (t.action) {
          case WorkerAction.Build: colour = "#fc0fc0"; break;
          case WorkerAction.CollectEnergy: colour = "#fff600"; break;
          case WorkerAction.Idle: colour = "#0000ff"; break;
          case WorkerAction.MaintainController: colour = "#dc143c"; break;
          case WorkerAction.Mine: colour = "#ffe4cd"; break;
          case WorkerAction.Pickup: colour = "#b0c24a"; break;
          case WorkerAction.Repair: colour = "#808080"; break;
          case WorkerAction.Supply: colour = "#ff00ff"; break;
          case WorkerAction.UpgradeController: colour = "#ffd700"; break;
        }
        if (!t.target) continue;
        const obj = Game.getObjectById(t.target);
        if (!obj) continue;
        this.manager.room.visual.circle(obj.pos.x, obj.pos.y, { fill: colour, radius: 0.25 });
      }
    }
  }
}

export class WorkerII extends WorkerI {
  static override readonly RoleName: string = "WorkerII";

  StartSpawnAtRCL = 2;
  StopSpawnAtRCL = 100;
  BodyParts = [MOVE, MOVE, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY];
  override get CountPerRoom() { return 10; }

  override CanSpawn(): boolean {
    // There must be at least 1 miner before we spawn WorkerII
    if ((this.manager.CreepsByRole.get("Miner")?.length ?? 0) > 0)
      return true;

    console.log("Not enough miners to spawn WorkerII")
    return false;
  }
}
