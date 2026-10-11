import { Colours } from "Data";
import { sum } from "lodash";
import type { RoomExtra } from "Room";
import { Logger } from "utils/Logger";
import { Colony } from "Colony";
import { countGraphemes } from "unicode-segmenter";
import { CreepRole } from "roles/Role";
import { CreepTask } from "Tasks";

declare global {
  interface CreepMemory {
    role: string;
    room: string;
    jobMemory: object;
    stuckTicks: number;
    lastPos: { x: number, y: number; };
    moveMode?: "long" | "avoidCreeps";
    successfulAvoidMoves?: number;
    _move?: {
      dest: { x: number, y: number, room: string; },
      time: number,
      path: string,
      room: string,
    },
  }
}

export class CreepExtra extends Creep {

  MaxStuckTicks = 2;
  MaxAvoidTicks = 3;
  MaxPathfindingOps = 200;

  private readonly log = new Logger(this, { formatArgs: { "<creep>": this } });
  private readonly colony: Colony;
  constructor(id: Id<Creep>, colony: Colony) {
    super(id);
    this.colony = colony;
  }

  static BodyCost(body: BodyPartConstant[]): number { return sum(body.map(p => BODYPART_COST[p])); }

  get role(): CreepRole | undefined {
    return this.colony.RoleRegistry.get(this.memory.role);
  }

  get currentTask(): CreepTask | undefined {
    const task = this.memory.jobMemory;
    if (!task || typeof task !== "object") return undefined;
    const record = task as Record<string, unknown>;
    const kind = record.kind;
    if (typeof kind !== "string") return undefined;
    const taskPrototype = this.colony.TaskRegistry.get(kind);
    if (!taskPrototype) return undefined;
    return Object.assign(Object.create(taskPrototype), record) as CreepTask;
  }

  set currentTask(value: CreepTask | undefined) {
    const cast = value as CreepTask;
    if (cast == null || cast == undefined) return;
    this.memory.jobMemory = cast;
  }

  MoveLong(dest: RoomPosition | { pos: RoomPosition; }, opts?: MoveToOpts): number {
    this.log.debug("Invoking MoveLong...");
    return this.moveTo(dest, {
      ...opts,
      visualizePathStyle: { stroke: Colours.PATH_LONG, lineStyle: "solid" },
      ignoreCreeps: true,
      maxOps: this.MaxPathfindingOps * 4,
      plainCost: 3
    });
  }

  MoveAvoidCreeps(dest: RoomPosition | { pos: RoomPosition; }, opts?: MoveToOpts): number {
    this.log.debug("Invoking MoveAvoidCreeps...");
    return this.moveTo(dest, {
      ...opts,
      visualizePathStyle: { stroke: Colours.PATH_STUCK, lineStyle: "dotted" },
      ignoreCreeps: false,
      maxOps: this.MaxPathfindingOps,
      ignoreRoads: true,
    });
  }

  // Returns 1 when in range; otherwise returns the moveTo result.
  MoveCreep(target: RoomPosition | { pos: RoomPosition; }, opts?: MoveToOpts): number {
    // Init movement trackers
    this.memory.moveMode ??= "long";
    this.memory.stuckTicks ??= 0;
    this.memory.successfulAvoidMoves ??= 0;
    const withinRange = opts?.range ?? 1;

    // Figure out if we moved, and then update position
    const movedBetweenTicks = !this.memory.lastPos
      || this.pos.x !== this.memory.lastPos.x
      || this.pos.y !== this.memory.lastPos.y;
    this.memory.lastPos = { x: this.pos.x, y: this.pos.y };

    // Arrived / Base case
    if (this.pos.getRangeTo(target) <= withinRange) {
      // Reset to clean, long move mode
      this.memory.stuckTicks = 0;
      this.memory.successfulAvoidMoves = 0;
      this.memory.moveMode = "long";
      delete this.memory._move; // Clear out saved path
      this.log.debug("Move complete, arrived and reset stuck tracking.");
      return 1;
    }

    // Increment counters
    if (this.memory.moveMode === "avoidCreeps" && movedBetweenTicks) {
      this.log.debug(`avoidCreeps && movedBetweenTicks; ${this.memory.successfulAvoidMoves} (+1)`);
      this.memory.successfulAvoidMoves++;
    } else if (this.memory.moveMode === "long" && !movedBetweenTicks && this.fatigue === 0) {
      this.log.debug(`long && !movedBetweenTicks && this.fatigue === 0; ${this.memory.stuckTicks} (+1)`);
      this.memory.stuckTicks++;
    } else if (this.memory.moveMode === "long" && movedBetweenTicks) {
      this.log.debug(`long && movedBetweenTicks; Was stuck ${this.memory.stuckTicks}, now 0.`);
      this.memory.stuckTicks = 0;
    }

    // Switch move mode
    if (this.memory.moveMode === "long" && this.memory.stuckTicks > this.MaxStuckTicks) {
      this.log.debug("Switched to move mode: avoidCreeps");
      this.memory.moveMode = "avoidCreeps";
      this.memory.stuckTicks = 0;
      this.memory.successfulAvoidMoves = 0;
    } else if (this.memory.moveMode === "avoidCreeps" && this.memory.successfulAvoidMoves > this.MaxAvoidTicks) {
      this.log.debug("Switched to move mode: long");
      this.memory.moveMode = "long";
      this.memory.stuckTicks = 0;
      this.memory.successfulAvoidMoves = 0;
    }

    // Invoke the actual move
    return this.memory.moveMode === "long"
      ? this.MoveLong(target, opts)
      : this.MoveAvoidCreeps(target, opts);
  }

  TickFriendlyCreep(room: RoomExtra): void {
    if (this.spawning) return;
    this.Lifecycle();
    if (this.role) this.PerformRole(room, this.role);
  }

  Lifecycle(): void {
    if (this.ticksToLive === 15)
      this.say("😨", true);
    else if (this.ticksToLive === 10)
      this.say("😰", true);
    else if (this.ticksToLive === 5)
      this.say("😭🙏", true);
    else if (this.ticksToLive === 4)
      this.say("🫲☹️🫱💔🫂", true);
    else if (this.ticksToLive === 3)
      this.say("🤡", true);
    else if (this.ticksToLive === 2) {
      this.say("☠️", true);
    } else if (this.ticksToLive === 1) {
      this.say("☠️☠️☠️", true);
    }
  }

  OnTaskChanged(room: RoomExtra, role: CreepRole, oldTask: CreepTask, newTask: CreepTask): void {
    this.log.info(`Reassigned ${oldTask} -> ${newTask}`, { "<room>": room, "<role>": role });
    this.say(newTask.action);
  }

  PerformRole(room: RoomExtra, role: CreepRole): void {
    role.TickCreep(this, room);

    // Get the current task from memory, or a default task from the role.
    var task = this.currentTask ?? role.GetInitialTask(room);

    // If it's complete, get the next task.
    if (task.isComplete(this)) {
      const nextTask = role.SelectNextTask(this, room);
      this.OnTaskChanged(room, role, task, nextTask);
      task = nextTask;
    }

    // Act on the task
    const outcome = task.act(this);
    this.log.debug(`Task.act: ${JSON.stringify(task)} Outcome [target.pos: ${outcome?.target.pos} result: ${outcome?.result}, range: ${outcome?.range}]`, { "<role>": role, "<room>": room });

    // Update memory
    this.currentTask = task;

    // Handle no result
    if (outcome == null || outcome == undefined) return;

    // Handle ScreepsReturnCode
    switch (outcome.result) {
      case OK:
      case ERR_FULL:
      case ERR_NOT_ENOUGH_RESOURCES: {
        // These can be ignored.
        return;
      }
      case ERR_NOT_IN_RANGE: {
        // Move. Since this is our last action, ignore the RC.
        this.MoveCreep(outcome.target.pos, { range: outcome.range });
        return;
      }
      default: {
        // Generic print all
        this.log.warn(`Act: Task ${task} was not successful: ${JSON.stringify(outcome)}`, { "<room>": room, "<role>": role });
        return;
      }
    }
  }
}
