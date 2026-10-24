import { Colours } from "Data";
import type { RoomExtra } from "Room";
import { Logger } from "utils/Logger";
import { Colony } from "Colony";
import { CreepRole } from "roles/Role";
import { CreepTask } from "tasks";

declare global {
  interface CreepMemory {
    role?: string;
    room?: string;
    currentTask?: CreepTask | null;
    stuckTicks?: number;
    lastPos?: { x: number, y: number, room: string; };
    moveMode?: "long" | "avoidCreeps";
    successfulAvoidMoves?: number;
    spawning?: boolean,
    exit?: { x: number, y: number, room: string; },
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
  readonly colony: Colony;
  constructor(id: Id<Creep>, colony: Colony) {
    super(id);
    this.colony = colony;
  }

  get role(): CreepRole {
    if (!this.memory.role) {
      // It's a game breaking error to have no role
      throw new Error(`Creep ${this.name} has no role: ${this.memory.role}`);
    }

    return this.colony.GetRole(this.memory.role);
  }

  get currentTask(): CreepTask | null { return this.colony.DeserializeTask(this.memory.currentTask); }
  private set currentTask(value: CreepTask | null) { this.memory.currentTask = value; }

  private cachedAssignedRoom?: RoomExtra;
  get AssignedRoom(): RoomExtra {
    // Return memoized.
    if (this.cachedAssignedRoom) return this.cachedAssignedRoom;

    // Fetch and memoize our assigned room.
    if (!this.memory.room) { throw new Error(`Creep ${this.name} has no assigned room!`); }
    const room = this.colony.MyRooms.filter(r => r.name === this.memory.room).pop();
    if (!room) throw new Error(`Assigned Room ${this.memory.room} not in colony.MyRooms!`);
    this.cachedAssignedRoom = room;

    // Return fetched.
    return this.cachedAssignedRoom;
  }


  MaxStuckTicks = 2;
  MaxAvoidTicks = 3;
  MaxPathfindingOps = 200;
  MoveLong(pos: RoomPosition, opts?: MoveToOpts): number {
    this.log.debug(`Invoking MoveLong ${pos} ${JSON.stringify(opts)}...`);

    const costCallback = (rn: string, cm: CostMatrix) => {
      if (!(rn in Game.rooms)) return cm;
      const myRoom = this.colony.MyRooms.filter(mr => mr.name === rn).pop();
      if (myRoom) return myRoom.PathfindingCostMatrix;
      return cm;
    };

    return this.moveTo(pos, {
      ...opts,
      costCallback,
      visualizePathStyle: { stroke: Colours.PATH_LONG, lineStyle: "solid" },
      maxOps: this.MaxPathfindingOps * 4,
      ignoreCreeps: true,
      reusePath: 20,
      plainCost: 2,
    });
  }

  MoveAvoidCreeps(pos: RoomPosition, opts?: MoveToOpts): number {
    this.log.debug(`Invoking MoveAvoidCreeps ${pos} ${JSON.stringify(opts)}...`);
    // eslint-disable-next-line no-underscore-dangle
    delete this.memory._move; // Clear out any cached path
    return this.moveTo(pos, {
      ...opts,
      visualizePathStyle: { stroke: Colours.PATH_STUCK, lineStyle: "dotted" },
      maxOps: this.MaxPathfindingOps,
      ignoreCreeps: false,
      reusePath: 0,
      plainCost: 1,
    });
  }

  OnUnstuck(): void { return; }
  OnStuck(): void { return; }
  OnMoveSucceeded(): void { return; }

  // Returns 1 when in range; otherwise returns the moveTo result.
  MoveCreep(target: RoomPosition | { pos: RoomPosition; }, opts?: MoveToOpts): number {
    const targetPos = target instanceof RoomPosition ? target : target.pos;

    // Init movement trackers
    this.memory.moveMode ??= "long";
    this.memory.stuckTicks ??= 0;
    this.memory.successfulAvoidMoves ??= 0;

    // Figure out if we moved, and then update position
    const movedBetweenTicks = this.memory.lastPos === undefined
      || this.pos.x !== this.memory.lastPos.x
      || this.pos.y !== this.memory.lastPos.y
      || this.pos.roomName !== this.memory.lastPos.room;
    this.memory.lastPos = { x: this.pos.x, y: this.pos.y, room: this.pos.roomName };


    if (this.pos.roomName === targetPos.roomName && this.pos.getRangeTo(targetPos) <= (opts?.range ?? 1)) {
      // Arrived / Base case
      // Reset to clean, long move mode
      this.memory.exit = undefined;
      this.memory.stuckTicks = 0;
      this.memory.successfulAvoidMoves = 0;
      this.memory.moveMode = "long";
      // eslint-disable-next-line no-underscore-dangle
      delete this.memory._move; // Clear out saved path
      this.log.verbose("MoveCreep: Move complete, arrived and reset stuck tracking.");
      this.OnMoveSucceeded();
      return 1;
    }

    // Increment counters
    if (this.memory.moveMode === "avoidCreeps" && movedBetweenTicks) {
      this.log.verbose(`MoveCreep: avoidCreeps && movedBetweenTicks; ${this.memory.successfulAvoidMoves} (+1)`);
      this.memory.successfulAvoidMoves++;
    } else if (this.memory.moveMode === "long" && !movedBetweenTicks && this.fatigue === 0) {
      this.log.verbose(`MoveCreep: long && !movedBetweenTicks && this.fatigue === 0; ${this.memory.stuckTicks} (+1)`);
      this.memory.stuckTicks++;
    } else if (this.memory.stuckTicks && this.memory.moveMode === "long" && movedBetweenTicks) {
      this.log.verbose(`MoveCreep: long && movedBetweenTicks; Was stuck ${this.memory.stuckTicks}, now 0.`);
      this.memory.stuckTicks = 0;
    }

    // Switch move mode
    if (this.memory.moveMode === "long" && this.memory.stuckTicks > this.MaxStuckTicks) {
      this.OnStuck();
      this.memory.moveMode = "avoidCreeps";
      this.memory.stuckTicks = 0;
      this.memory.successfulAvoidMoves = 0;
    } else if (this.memory.moveMode === "avoidCreeps" && this.memory.successfulAvoidMoves >= this.MaxAvoidTicks) {
      this.OnUnstuck();
      this.memory.moveMode = "long";
      this.memory.stuckTicks = 0;
      this.memory.successfulAvoidMoves = 0;
    }

    return this.memory.moveMode === "long"
      ? this.MoveLong(targetPos, opts)
      : this.MoveAvoidCreeps(targetPos, opts);
  }

  JustFinishedSpawning(room: RoomExtra): void {
    this.memory.spawning = false;
    this.log.info(`Ready for service!`, { "<room>": room });
    if (this.role) this.role.OnSpawn(this);
  }

  CheckRoomEvents(room: RoomExtra): void {
    // If Creep is spawning, don't proceed.
    this.memory.spawning ??= false; // If null, default to not spawning.
    if (this.spawning) return; // Do not tick spawning creeps
    else if (!this.spawning && (this.memory.spawning ?? false))
      this.JustFinishedSpawning(room);
    else if (this.ticksToLive === 1)
      this.OnLastTickOfLife();

    // Run a callback if we moved to a new room since last tick.
    if (this.memory.lastPos && this.room.name !== this.memory.lastPos.room)
      this.OnCreepChangedRooms(this.memory.lastPos.room);
  }

  MovedBetweenRooms = false;
  OnCreepChangedRooms(lastRoomName: string): void {
    this.log.info(`I moved from ${lastRoomName} to ${this.room.name}`);
    this.MovedBetweenRooms = true;
  }

  OnLastTickOfLife(): void {
    this.log.info("Goodbye cruel world :(");
    this.say('☠️☠️☠️', true);
  }

  ChangeTask(): void {
    const oldTask = this.currentTask;
    const newTask = this.role.SelectNextTask(this);
    this.currentTask = newTask;

    // Log the transition as long as it's not Idle -> Idle.
    if (!newTask && oldTask)
      this.log.info(`Unassigned ${oldTask}`);
    else if (newTask && !oldTask)
      this.log.info(`Assigned ${newTask}`);
    else if (oldTask && newTask)
      this.log.info(`Reassigned ${oldTask} -> ${newTask}`);

    // If the transition was to nothing, end here
    if (!newTask) return;

    // If the transition ended with a new task, speak its action
    this.say(newTask.action);
  }

  DoTask(): void {
    const task = this.currentTask;
    if (task === null) return; // Nothing more to do
    const outcome = task.act(this); // Act on the task
    this.currentTask = task;
    const outcomeSummary = `[target.pos: ${outcome?.target.pos} result: ${outcome?.result}, range: ${outcome?.range}]`;
    this.log.verbose(`Task.act: ${JSON.stringify(task)} Outcome ${outcomeSummary}`, { "<role>": this.role });

    // Handle no result
    if (outcome === null || outcome === undefined)
      return;

    // Handle ScreepsReturnCode
    switch (outcome.result) {
      case OK:
      case ERR_FULL:
      case ERR_NOT_ENOUGH_RESOURCES:
        return; // These can be ignored.
      case ERR_NOT_IN_RANGE: {
        // We have to move to the task's target
        const moveResult = this.MoveCreep(outcome.target.pos, { range: outcome.range });
        if (moveResult === ERR_NO_PATH) {
          // If pathfinding fails, select a new task
          this.log.warn(` Outcome ${outcomeSummary}, Pathfinding from ${this.pos} to ${outcome.target.pos} failed.`);
          this.ChangeTask();
        }
        return;
      }
      default: {
        // Generic print all
        this.log.warn(`Act: Task ${task} was not successful: ${JSON.stringify(outcome)}`);
        return;
      }
    }
  }

  MoveIntoRoomIfOnEdge(): void {
    if (this.pos.y === 0) // TOP
      this.move(BOTTOM);
    else if (this.pos.x === 49) // RIGHT
      this.move(LEFT);
    else if (this.pos.y === 49) // BOTTOM
      this.move(TOP);
    else if (this.pos.x === 0) // LEFT
      this.move(RIGHT);
  }
}
