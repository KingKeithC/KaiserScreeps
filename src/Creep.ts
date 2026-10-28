import { Colours } from 'Data';
import type { RoomExtra } from 'Room';
import { Logger } from 'utils/Logger';
import { Colony } from 'Colony';
import { CreepRole } from 'roles/Role';
import { CreepTask } from 'tasks';
import { DeserializeRoomPosition, RoomPositionString, SerializeRoomPosition } from 'utils/Collections';

declare global {
  interface CreepMemory {
    role?: string;
    room?: string;
    currentTask?: CreepTask | null;
    stuckTicks?: number;
    lastPos?: RoomPositionString;
    moveMode?: 'long' | 'avoidCreeps';
    successfulAvoidMoves?: number; // In avoidCreeps mode, how many times did we successfully avoid them?
    spawning?: boolean; // Whether or not we were spawning on the LAST tick.
    lifetimeIdle?: number; // How many ticks have we gone without moving or performing an action (and not due to fatigue)?
    lifetimeStuck?: number; // For how many ticks have we tried to move, but ended up not (and not due to fatigue)?
    intendToMove?: boolean; // Whether or not we intended to move on the LAST tick.
    _move?: {
      // Move object tracked by screeps' internal moveTo method.
      dest: { x: number; y: number; room: string };
      time: number;
      path: string;
      room: string;
    };
  }
}

export class CreepExtra extends Creep {
  private readonly log = new Logger(this, { formatArgs: { '<creep>': this } });
  readonly colony: Colony;
  constructor(id: Id<Creep>, colony: Colony) {
    super(id);
    this.colony = colony;
    this.memory.moveMode ??= 'long';
    this.memory.stuckTicks ??= 0;
    this.memory.successfulAvoidMoves ??= 0;
  }

  get role(): CreepRole {
    if (!this.memory.role) {
      // It's a game breaking error to have no role
      throw new Error(`Creep ${this.name} has no role: ${this.memory.role}`);
    }

    return this.colony.GetRole(this.memory.role);
  }

  get currentTask(): CreepTask | null {
    return this.colony.DeserializeTask(this.memory.currentTask);
  }
  private set currentTask(value: CreepTask | null) {
    this.memory.currentTask = value;
  }

  private cachedAssignedRoom?: RoomExtra;
  get AssignedRoom(): RoomExtra {
    // Return memoized.
    if (this.cachedAssignedRoom) return this.cachedAssignedRoom;

    // Fetch and memoize our assigned room.
    if (!this.memory.room) {
      throw new Error(`Creep ${this.name} has no assigned room!`);
    }
    const room = this.colony.MyRooms.filter(r => r.name === this.memory.room).pop();
    if (!room) throw new Error(`Assigned Room ${this.memory.room} not in colony.MyRooms!`);
    this.cachedAssignedRoom = room;

    // Return fetched.
    return this.cachedAssignedRoom;
  }

  StartOfTick(): void {
    if (this.spawning) return; // Ignore spawning creeps.

    // Invoke callback is we just finished spawning
    if (!this.spawning && (this.memory.spawning ?? false)) {
      this.memory.spawning = false;
      this.log.info(`Ready for service!`);
      if (this.role) this.role.OnSpawn(this);
    } else if (this.ticksToLive === 1) this.OnLastTickOfLife();

    // Update state based on last tick's expectations.
    this.MovedBetweenTicks = !this.LastPos.isEqualTo(this.pos);
    if (this.MovedBetweenTicks && this.room.name !== this.LastPos.roomName) this.OnLeaveRoom(this.LastPos.roomName);
    if (this.IntendedToMove && !this.MovedBetweenTicks) this.LifetimeStuck++;

    // Reset after using its value:
    this.IntendedToMove = false;
  }

  MaxStuckTicks = 2;
  MaxAvoidTicks = 4;
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
      visualizePathStyle: { stroke: Colours.PATH_LONG, lineStyle: 'solid' },
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
      visualizePathStyle: { stroke: Colours.PATH_STUCK, lineStyle: 'dotted' },
      ignoreCreeps: false,
      reusePath: 0,
      plainCost: 1,
    });
  }

  // Returns 1 when in range; otherwise returns the moveTo result.
  MovedBetweenTicks = false;
  MoveCreep(target: RoomPosition | { pos: RoomPosition }, opts?: MoveToOpts): number {
    this.IntendedToMove = true;
    const targetPos = target instanceof RoomPosition ? target : target.pos;

    if (this.pos.roomName === targetPos.roomName && this.pos.getRangeTo(targetPos) <= (opts?.range ?? 1)) {
      // Arrived / Base case
      // Reset to clean, long move mode
      this.memory.stuckTicks = 0;
      this.memory.successfulAvoidMoves = 0;
      this.memory.moveMode = 'long';
      // eslint-disable-next-line no-underscore-dangle
      delete this.memory._move; // Clear out saved path
      return 1;
    }

    // Increment counters
    if (this.memory.moveMode === 'avoidCreeps' && this.MovedBetweenTicks) {
      this.log.debug(`MoveCreep: avoidCreeps && movedBetweenTicks; ${this.memory.successfulAvoidMoves} (+1)`);
      this.memory.successfulAvoidMoves = (this.memory.successfulAvoidMoves ?? 0) + 1;
    } else if (this.memory.moveMode === 'long' && !this.MovedBetweenTicks && this.fatigue === 0) {
      this.log.debug(`MoveCreep: long && !movedBetweenTicks && this.fatigue === 0; ${this.memory.stuckTicks} (+1)`);
      this.memory.stuckTicks = (this.memory.stuckTicks ?? 0) + 1;
    } else if (this.memory.stuckTicks && this.memory.moveMode === 'long' && this.MovedBetweenTicks) {
      this.log.debug(`MoveCreep: long && movedBetweenTicks; Was stuck ${this.memory.stuckTicks}, now 0.`);
      this.memory.stuckTicks = 0;
    }

    // Switch move mode
    if (this.memory.moveMode === 'long' && (this.memory.stuckTicks ?? 0) > this.MaxStuckTicks) {
      this.memory.moveMode = 'avoidCreeps';
      this.memory.stuckTicks = 0;
      this.memory.successfulAvoidMoves = 0;
    } else if (
      this.memory.moveMode === 'avoidCreeps' &&
      (this.memory.successfulAvoidMoves ?? 0) >= this.MaxAvoidTicks
    ) {
      this.memory.moveMode = 'long';
      this.memory.stuckTicks = 0;
      this.memory.successfulAvoidMoves = 0;
    }

    return this.memory.moveMode === 'long' ? this.MoveLong(targetPos, opts) : this.MoveAvoidCreeps(targetPos, opts);
  }

  get LastPos(): RoomPosition {
    return this.memory.lastPos ? DeserializeRoomPosition(this.memory.lastPos) : this.pos;
  }
  set LastPos(value: RoomPosition) {
    this.memory.lastPos = SerializeRoomPosition(value);
  }

  private set LifetimeIdle(value: number) {
    this.memory.lifetimeIdle = value;
  }
  get LifetimeIdle(): number {
    return this.memory.lifetimeIdle ?? 0;
  }

  private set LifetimeStuck(value: number) {
    this.memory.lifetimeStuck = value;
  }
  get LifetimeStuck(): number {
    return this.memory.lifetimeStuck ?? 0;
  }

  private set IntendedToMove(value: boolean) {
    this.memory.intendToMove = value;
  }
  get IntendedToMove(): boolean {
    return this.memory.intendToMove ?? false;
  }

  ActedThisTick = false;
  EndOfTick(): void {
    this.memory.lastPos = SerializeRoomPosition(this.pos);

    if (this.fatigue === 0 || this.spawning) return; // Nothing more to do, these situations don't count as idle

    // If we didn't move and didn't act, and aren't tired, increment the idle counter
    if (!(this.MovedBetweenRooms || this.MovedBetweenTicks || this.ActedThisTick)) this.LifetimeIdle++;
  }

  MovedBetweenRooms = false;
  OnLeaveRoom(lastRoomName: string): void {
    this.log.info(`I moved from ${lastRoomName} to ${this.room.name}`);
    this.MovedBetweenRooms = true;
  }

  OnLastTickOfLife(): void {
    this.log.info(`Goodbye cruel world :(  (LifetimeIdle: ${this.LifetimeIdle}, LifetimeStuck: ${this.LifetimeStuck})`);
    this.say('☠️☠️☠️', true);
  }

  ChangeTask(): void {
    const oldTask = this.currentTask;
    const newTask = this.role.SelectNextTask(this);
    this.currentTask = newTask;

    // Log the transition as long as it's not Idle -> Idle.
    if (!newTask && oldTask) this.log.info('Unassigned ${oldTask}', { oldTask });
    else if (newTask && !oldTask) this.log.info('Assigned ${newTask}', { newTask });
    else if (oldTask && newTask) this.log.info('Reassigned ${oldTask} -> ${newTask}', { oldTask, newTask });

    // If the transition was to nothing, end here
    if (!newTask) return;

    // If the transition ended with a new task, speak its action
    this.say(newTask.action);
  }

  DoTask(): void {
    const task = this.currentTask;
    if (task === null) {
      this.say('🤷');
      return; // Nothing more to do
    }
    const outcome = task.act(this); // Act on the task
    this.currentTask = task;
    this.ActedThisTick = true;
    this.log.debug('Task.act: ${task} Outcome ${outcome}', { '<role>': this.role, task, outcome });

    // Handle no result
    if (outcome === null || outcome === undefined) return;

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
          this.log.warn('Outcome ${outcome}, Pathfinding from ${thisPos} to ${targetPos} failed.', {
            outcome,
            thisPos: this.pos,
            targetPos: outcome.target.pos,
          });
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
    if (this.pos.y === 0)
      // TOP
      this.move(BOTTOM);
    else if (this.pos.x === 49)
      // RIGHT
      this.move(LEFT);
    else if (this.pos.y === 49)
      // BOTTOM
      this.move(TOP);
    else if (this.pos.x === 0)
      // LEFT
      this.move(RIGHT);
    else return;

    this.ActedThisTick = true;
    this.IntendedToMove = true;
  }
}
