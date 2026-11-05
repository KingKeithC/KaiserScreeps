import { Colours } from 'Data';
import type { RoomExtra } from 'Room';
import { Logger } from 'utils/Logger';
import { Colony } from 'Colony';
import { CreepRole } from 'roles/Role';
import { DeserializeRoomPosition, RoomPositionString, SerializeRoomPosition } from 'utils/Collections';
import { CreepTask, DeserializeTask } from 'tasks/types';

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
  constructor(
    id: Id<Creep>,
    public readonly colony: Colony,
  ) {
    super(id);
  }

  get role(): CreepRole {
    if (!this.memory.role) {
      // It's a game breaking error to have no role
      throw new Error(`Creep ${this.name} has no role: ${this.memory.role}`);
    }

    return this.colony.GetRole(this.memory.role);
  }

  private cachedCurrentTask?: CreepTask | null;
  get currentTask(): CreepTask | null {
    if (this.cachedCurrentTask !== undefined) return this.cachedCurrentTask;
    try {
      return (this.cachedCurrentTask = DeserializeTask(this.memory.currentTask));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.crit('Failed to deserialize task for ${creepName}; clearing it: ${error}', {
        creepName: this.name,
        error: message,
      });
      delete this.memory.currentTask;
      return (this.cachedCurrentTask = null);
    }
  }

  private set currentTask(value: CreepTask | null) {
    this.cachedCurrentTask = value;
    this.memory.currentTask = value === null ? null : { ...value, action: value.action };
  }

  private cachedAssignedRoom?: RoomExtra;
  get AssignedRoom(): RoomExtra {
    // Return memoized.
    if (this.cachedAssignedRoom) return this.cachedAssignedRoom;

    // Fetch and memoize our assigned room.
    if (!this.memory.room) {
      this.log.crit('Creep ${creepName} has no assigned room!', { creepName: this.name });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return null!;
    }
    const room = this.colony.MyRooms.filter(r => r.name === this.memory.room).pop();
    if (!room) {
      this.log.crit('Assigned Room ${roomName} not in colony.MyRooms!', { roomName: this.memory.room });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return null!;
    }
    this.cachedAssignedRoom = room;

    // Return fetched.
    return this.cachedAssignedRoom;
  }

  StartOfTick(): void {
    if (this.spawning) return; // Ignore spawning creeps.

    // Invoke callback if we just finished spawning
    if (!this.spawning && (this.memory.spawning ?? false)) {
      this.memory.spawning = false;
      this.log.info(`Ready for service!`);
      if (this.role) this.role.OnSpawn(this);
    } else if (this.ticksToLive === 1) this.OnLastTickOfLife();

    // Update state based on last tick's expectations.
    this.MovedBetweenTicks = !this.LastPos.isEqualTo(this.pos);
    if (this.MovedBetweenTicks && this.room.name !== this.LastPos.roomName) this.OnLeaveRoom();
    if (this.IntendedToMove && !this.MovedBetweenTicks) this.LifetimeStuck = this.LifetimeStuck + 1;

    // Reset after using its value:
    this.IntendedToMove = false;
  }

  MaxStuckTicks = 2;
  MaxAvoidTicks = 4;
  MoveLong(pos: RoomPosition, opts?: MoveToOpts): number {
    // this.log.debug('Invoking MoveLong to ${pos} with ${opts}', { pos, opts });
    return this.moveTo(pos, {
      ...opts,
      costCallback: (rn: string, cm: CostMatrix) => this.CostCallback(rn, cm, false),
      visualizePathStyle: Memory.globalEnablePathVisuals
        ? { stroke: Colours.PATH_LONG, lineStyle: 'solid' }
        : undefined,
      ignoreCreeps: true,
      reusePath: 50,
      plainCost: 2,
    });
  }

  MoveAvoidCreeps(pos: RoomPosition, opts?: MoveToOpts): number {
    // this.log.debug('Invoking MoveAvoidCreeps to ${pos} with ${opts}', { pos, opts });
    // eslint-disable-next-line no-underscore-dangle
    return this.moveTo(pos, {
      ...opts,
      costCallback: (rn: string, cm: CostMatrix) => this.CostCallback(rn, cm),
      visualizePathStyle: Memory.globalEnablePathVisuals
        ? { stroke: Colours.PATH_STUCK, lineStyle: 'dotted' }
        : undefined,
      reusePath: 5,
      plainCost: 2,
    });
  }

  CostCallback(roomName: string, matrix: CostMatrix, accountForCreeps = true): CostMatrix | void {
    const myRoom = this.colony.Rooms.get(roomName);
    if (!myRoom?.controller?.my) return matrix;
    return accountForCreeps ? myRoom.CreepsCostMatrix : myRoom.StructuresCostMatrix;
  }

  // Returns 1 when in range; otherwise returns the moveTo result.
  MovedBetweenTicks = false;
  MoveCreep(target: RoomPosition | { pos: RoomPosition }, opts?: MoveToOpts): number {
    // Init move trackers
    this.memory.moveMode ??= 'long';
    this.memory.stuckTicks ??= 0;
    this.memory.successfulAvoidMoves ??= 0;

    this.IntendedToMove = true;
    const targetPos = target instanceof RoomPosition ? target : target.pos;

    if (!(targetPos.roomName in Game.rooms))
      this.log.warn('MoveCreep invoked to target room that is not visible: ${target}', { target: targetPos });

    if (this.pos.roomName === targetPos.roomName && this.pos.getRangeTo(targetPos) <= (opts?.range ?? 1)) {
      this.log.debug(`MoveCreep: arrived!`);
      // Arrived / Base case
      // Reset to clean, long move mode
      this.memory.stuckTicks = 0;
      this.memory.successfulAvoidMoves = 0;
      this.memory.moveMode = 'long';
      return 1;
    }

    // Increment counters
    if (this.memory.moveMode === 'avoidCreeps' && this.MovedBetweenTicks) {
      this.memory.successfulAvoidMoves = (this.memory.successfulAvoidMoves ?? 0) + 1;
    } else if (this.memory.moveMode === 'long' && !this.MovedBetweenTicks && this.fatigue === 0) {
      this.memory.stuckTicks = (this.memory.stuckTicks ?? 0) + 1;
    } else if (this.memory.stuckTicks && this.memory.moveMode === 'long' && this.MovedBetweenTicks) {
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
    return (this.memory.lifetimeIdle ??= 0);
  }

  private set LifetimeStuck(value: number) {
    this.memory.lifetimeStuck = value;
  }
  get LifetimeStuck(): number {
    return (this.memory.lifetimeStuck ??= 0);
  }

  private set IntendedToMove(value: boolean) {
    this.memory.intendToMove = value;
  }
  get IntendedToMove(): boolean {
    return (this.memory.intendToMove ??= false);
  }

  ActedThisTick = false;
  EndOfTick(): void {
    this.memory.lastPos = SerializeRoomPosition(this.pos);

    if (this.fatigue > 0 || this.spawning) return; // Fatigue and spawning don't count as idle

    // If we didn't move and didn't act, and aren't tired, increment the idle counter
    if (!(this.MovedBetweenRooms || this.MovedBetweenTicks || this.ActedThisTick))
      this.LifetimeIdle = this.LifetimeIdle + 1;
  }

  MovedBetweenRooms = false;
  OnLeaveRoom(): void {
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
    // Early return for no task
    const task = this.currentTask;
    if (task === null) {
      this.say('🤷');
      return;
    }

    const outcome = task.handleOutcome(this, task.act(this));
    this.currentTask = task; // Save task back to itself since acting on it might have changed it
    this.ActedThisTick = true; // Update non-idle flag since we acted

    // Handle follow up actions

    if (task.isCompleteFlag) {
      // Task finshed, so change it now proactively
      this.ChangeTask();
      return;
    } else if (outcome === null || outcome === undefined || outcome.result === OK)
      // Task was ok or couldn't act, but still isn't complete, and don't need to move.
      return;
    else if (outcome.result === ERR_NOT_IN_RANGE) {
      // We have to move to the task's target
      const moveResult = this.MoveCreep(outcome.target.pos, { range: outcome.range });

      if (moveResult !== OK && moveResult !== ERR_TIRED)
        // Log bad moves
        this.log.debug(
          'DoTask: MoveNotOK - ${moveResult}, ${task} Outcome ${outcome}, Follow up move from ${thisPos} to ${targetPos} failed.',
          { moveResult, task, outcome, thisPos: this.pos, targetPos: outcome.target.pos },
        );

      // If pathfinding failed, select a new task
      if (moveResult === ERR_NO_PATH) this.ChangeTask();
    } else {
      // Task result was not ok and not a move
      this.log.debug('DoTask: NotOK - Task ${task} Outcome ${outcome}.', {
        task,
        outcome,
        thisPos: this.pos,
        targetPos: outcome.target.pos,
      });
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
