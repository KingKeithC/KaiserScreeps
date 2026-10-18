import { Colours } from "Data";
import { sum } from "lodash";
import type { RoomExtra } from "Room";
import { Logger } from "utils/Logger";
import { Colony } from "Colony";
import { countGraphemes } from "unicode-segmenter";
import { CreepRole } from "roles/Role";
import { CreepTask, TaskAction } from "tasks";

declare global {
  interface CreepMemory {
    role: string;
    room: string;
    jobMemory: object;
    stuckTicks: number;
    lastPos: { x: number, y: number, room: string; };
    moveMode?: "long" | "avoidCreeps";
    successfulAvoidMoves?: number;
    _spawning?: boolean,
    _exit?: { x: number, y: number, room: string; },
    _move?: {
      dest: { x: number, y: number, room: string; },
      time: number,
      path: string,
      room: string,
    },
  }
}

export class CreepExtra extends Creep {
  private readonly log = new Logger(this, { formatArgs: { "<creep>": this } });
  private readonly colony: Colony;
  constructor(id: Id<Creep>, colony: Colony) {
    super(id);
    this.colony = colony;
  }

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

  private _AssignedRoom?: RoomExtra;
  get AssignedRoom(): RoomExtra {
    // Return memoized.
    if (this._AssignedRoom) return this._AssignedRoom;

    // Fetch and memoize our assigned room.
    if (!this.memory.room) { throw new Error(`Creep ${this.name} has no assigned room!`); }
    const room = this.colony.MyRooms.filter(r => r.name === this.memory.room).pop();
    if (!room) throw new Error(`Assigned Room ${this.memory.room} not in colony.MyRooms!`);
    this._AssignedRoom = room;

    // Return fetched.
    return this._AssignedRoom;
  }

  set currentTask(value: CreepTask | undefined) {
    const cast = value as CreepTask;
    if (cast == null || cast == undefined) return;
    this.memory.jobMemory = cast;
  }

  MaxStuckTicks = 2;
  MaxAvoidTicks = 3;
  MaxPathfindingOps = 200;
  MoveLong(pos: RoomPosition, opts?: MoveToOpts): number {
    this.log.debug(`Invoking MoveLong ${pos} ${JSON.stringify(opts)}...`);
    return this.moveTo(pos, {
      ...opts,
      visualizePathStyle: { stroke: Colours.PATH_LONG, lineStyle: "solid" },
      ignoreCreeps: true,
      // maxOps: this.MaxPathfindingOps * 4,
      plainCost: 3
    });
  }

  MoveAvoidCreeps(pos: RoomPosition, opts?: MoveToOpts): number {
    this.log.debug(`Invoking MoveAvoidCreeps ${pos} ${JSON.stringify(opts)}...`);
    return this.moveTo(pos, {
      ...opts,
      visualizePathStyle: { stroke: Colours.PATH_STUCK, lineStyle: "dotted" },
      ignoreCreeps: false,
      // maxOps: this.MaxPathfindingOps,
      ignoreRoads: true,
    });
  }

  // Returns 1 when in range; otherwise returns the moveTo result.
  MoveCreep(target: RoomPosition | { pos: RoomPosition; }, opts?: MoveToOpts): number {
    var targetPos = target instanceof RoomPosition ? target : target.pos;

    // Init movement trackers
    this.memory.moveMode ??= "long";
    this.memory.stuckTicks ??= 0;
    this.memory.successfulAvoidMoves ??= 0;
    var minRange = opts?.range ?? 1;

    // Figure out if we moved, and then update position
    const movedBetweenTicks = !this.memory.lastPos
      || this.pos.x !== this.memory.lastPos.x
      || this.pos.y !== this.memory.lastPos.y
      || this.pos.roomName !== this.memory.lastPos.room;
    this.memory.lastPos = { x: this.pos.x, y: this.pos.y, room: this.pos.roomName };


    if (this.pos.roomName === targetPos.roomName && this.pos.getRangeTo(targetPos) <= minRange) {
      // Arrived / Base case
      // Reset to clean, long move mode
      this.memory._exit = undefined;
      this.memory.stuckTicks = 0;
      this.memory.successfulAvoidMoves = 0;
      this.memory.moveMode = "long";
      delete this.memory._move; // Clear out saved path
      this.log.debug("MoveCreep: Move complete, arrived and reset stuck tracking.");
      return 1;
    }

    // Increment counters
    if (this.memory.moveMode === "avoidCreeps" && movedBetweenTicks) {
      this.log.debug(`MoveCreep: avoidCreeps && movedBetweenTicks; ${this.memory.successfulAvoidMoves} (+1)`);
      this.memory.successfulAvoidMoves++;
    } else if (this.memory.moveMode === "long" && !movedBetweenTicks && this.fatigue === 0) {
      this.log.debug(`MoveCreep: long && !movedBetweenTicks && this.fatigue === 0; ${this.memory.stuckTicks} (+1)`);
      this.memory.stuckTicks++;
    } else if (this.memory.moveMode === "long" && movedBetweenTicks) {
      this.log.debug(`MoveCreep: long && movedBetweenTicks; Was stuck ${this.memory.stuckTicks}, now 0.`);
      this.memory.stuckTicks = 0;
    }

    // Switch move mode
    if (this.memory.moveMode === "long" && this.memory.stuckTicks > this.MaxStuckTicks) {
      this.memory.moveMode = "avoidCreeps";
      this.memory.stuckTicks = 0;
      this.memory.successfulAvoidMoves = 0;
    } else if (this.memory.moveMode === "avoidCreeps" && this.memory.successfulAvoidMoves > this.MaxAvoidTicks) {
      this.memory.moveMode = "long";
      this.memory.stuckTicks = 0;
      this.memory.successfulAvoidMoves = 0;
    }

    return this.memory.moveMode === "long"
      ? this.MoveLong(targetPos, opts)
      : this.MoveAvoidCreeps(targetPos, opts);
  }

  JustFinishedSpawning(room: RoomExtra): void {
    this.memory._spawning = false;
    this.log.info(`Ready for service!`, { "<room>": room });
    if (this.role) this.role.OnSpawn(this);
  }

  Tick(room: RoomExtra): void {
    // If Creep is spawning, don't proceed.
    this.memory._spawning ??= false; // If null, default to not spawning.
    if (this.spawning) return; // Do not tick spawning creeps
    else if (!this.spawning && (this.memory._spawning ?? false))
      this.JustFinishedSpawning(room);
    else if (this.ticksToLive === 1)
      this.OnLastTickOfLife();

    // Run a callback if we moved to a new room since last tick.
    if (this.room.name !== this.memory.lastPos.room)
      this.OnCreepChangedRooms(this.memory.lastPos.room);
  }

  MovedBetweenRooms: boolean = false;
  OnCreepChangedRooms(lastRoomName: string): void {
    this.MovedBetweenRooms = true;
  }

  OnLastTickOfLife(): void {
    this.log.info("Goodbye cruel world :(");
    this.say('☠️☠️☠️', true);
  }

  OnTaskChanged(room: RoomExtra, role: CreepRole, oldTask: CreepTask | null, newTask: CreepTask): void {
    this.say(newTask.action);

    // Log the transition as long as it's not Idle -> Idle.
    if (oldTask == null || oldTask == undefined)
      this.log.info(`  Assigned ${newTask}`, { "<room>": room, "<role>": role });
    else if (!(oldTask.action === TaskAction.Idle && newTask.action === TaskAction.Idle))
      this.log.info(`Reassigned ${oldTask} -> ${newTask}`, { "<room>": room, "<role>": role });
  }

  PerformRole(): void {
    if (!this.role) return;
    const role = this.role;
    const room = this.AssignedRoom;

    role.TickCreep(this);

    // Get the current task from memory, or a default task from the role.
    var task = this.currentTask ?? null;

    // If it's complete, get the next task.
    if (task == null || task == undefined || task.isComplete(this)) {
      const nextTask = role.SelectNextTask(this, task);
      if (nextTask != null) {
        this.OnTaskChanged(room, role, task, nextTask);
        task = nextTask;
        this.currentTask = nextTask;
      } else {
        // No next task, do nothing.
        this.currentTask = undefined;
        return;
      }
    }

    // Act on the task
    const outcome = task.act(this);
    this.log.verbose(`Task.act: ${JSON.stringify(task)} Outcome [target.pos: ${outcome?.target.pos} result: ${outcome?.result}, range: ${outcome?.range}]`, { "<role>": role, "<room>": room });

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
        const res = this.MoveCreep(outcome.target.pos, { range: outcome.range });
        // if (res !== OK) this.log.info(`Move to ${outcome.target.pos} resulted in ${res}`, { "<room>": room, "<role>": role });
        if (res === ERR_NO_PATH) {
          this.log.warn(`Pathfinding from ${this.pos} to ${outcome.target.pos} failed.`, { "<role>": this.role });
          // delete this.memory["_move"]; // Clear out stale path
        }
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
