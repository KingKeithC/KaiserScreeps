import { Colours } from 'Data';
import type { RoomExtra } from 'Room';
import { Logger } from 'utils/Logger';
import { Colony } from 'Colony';
import { CreepRole } from 'roles/Role';
import { DeserializeRoomPosition, OK_MOVE_DONE, RoomPositionString, SerializeRoomPosition } from 'utils/Collections';
import { CreepTask, DeserializeTask } from 'tasks/types';
import { FromEdgeIntoRoom as DirectionIntoRoomFromEdge, EdgeStoodOn } from 'utils/CreepUtils';
import { Scout, ScoutingReport } from 'roles/Scout';
import { MakeRoomReport } from 'utils/RoomUtils';
import { Mine } from 'tasks';
import { Miner } from 'roles/Miner';

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
    intendedToMove?: boolean; // Whether or not we intended to move on the LAST tick.
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
    if (this.cachedCurrentTask) return this.cachedCurrentTask;
    try {
      return (this.cachedCurrentTask = DeserializeTask(this.memory.currentTask));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.crit('Failed to deserialize task; clearing it.', { errorMessage: message });
      delete this.memory.currentTask;
      return (this.cachedCurrentTask = null);
    }
  }
  private set currentTask(value: CreepTask | null) {
    this.memory.currentTask = this.cachedCurrentTask = value;
  }

  IsAMiningMiner(): boolean {
    if (!(this.role instanceof Miner)) return false;
    if (this.currentTask?.action !== Mine.action) return false;
    return true;
  }

  IsInAssignedMiningPosition(): boolean {
    if (!this.IsAMiningMiner()) return false;

    const miningTask: Mine = this.currentTask as Mine;
    if (miningTask.movementRange === 0 && SerializeRoomPosition(this.pos) === miningTask.miningPosition.pos)
      return true;
    return false;
  }

  private cachedAssignedRoom?: RoomExtra;
  get AssignedRoom(): RoomExtra {
    // Return memoized.
    if (this.cachedAssignedRoom) return this.cachedAssignedRoom;

    // Fetch and memoize our assigned room.
    if (!this.memory.room) {
      this.log.crit('Creep has no assigned room.');
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return null!;
    }
    const room = this.colony.MyRooms.filter(r => r.name === this.memory.room).pop();
    if (!room) {
      this.log.crit('Assigned room is not in the colony.', { assignedRoom: this.memory.room });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return null!;
    }
    this.cachedAssignedRoom = room;

    // Return fetched.
    return this.cachedAssignedRoom;
  }

  MovedBetweenTicks = false;
  StartOfTick(): void {
    if (this.spawning) return; // Ignore spawning creeps.

    // Invoke callback if we just finished spawning
    if (!this.spawning && (this.memory.spawning ?? false)) {
      this.memory.spawning = false;
      this.log.info('Ready for service.');
      if (this.role) this.role.OnSpawn(this);
    } else if (this.ticksToLive === 1) this.OnLastTickOfLife();

    // Update state based on last tick's expectations.
    this.MovedBetweenTicks = !this.LastPos.isEqualTo(this.pos);
    if (this.MovedBetweenTicks && this.room.name !== this.LastPos.roomName) this.OnLeaveRoom();
    if (this.IntendedToMove && !this.MovedBetweenTicks) this.IncrementStuck();

    // Reset after using its value:
    this.IntendedToMove = false;

    this.UpdateScoutingReportForStoodInRoom();
  }

  MaxStuckTicks = 2;
  MaxAvoidTicks = 4;
  MoveLong(pos: RoomPosition, opts?: MoveToOpts): ScreepsReturnCode {
    // this.log.debug('Invoking MoveLong.', { '<creep>': this, pos, opts });
    return this.moveTo(pos, {
      ...opts,
      costCallback: (rn: string, cm: CostMatrix) => this.CostCallback(rn, cm, false),
      visualizePathStyle: Memory.globalEnablePathVisuals
        ? { stroke: Colours.PATH_LONG, lineStyle: 'solid' }
        : undefined,
      reusePath: 50,
      plainCost: 2,
    });
  }

  MoveAvoidCreeps(pos: RoomPosition, opts?: MoveToOpts): ScreepsReturnCode {
    // this.log.debug('Invoking MoveAvoidCreeps.', { '<creep>': this, pos, opts });
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
  MoveCreep(target: RoomPosition | { pos: RoomPosition }, opts?: MoveToOpts): ScreepsReturnCode | typeof OK_MOVE_DONE {
    // Init move trackers
    this.memory.moveMode ??= 'long';
    this.memory.stuckTicks ??= 0;
    this.memory.successfulAvoidMoves ??= 0;

    const targetPos = target instanceof RoomPosition ? target : target.pos;

    // Target room may not be visible, so don't inspect anything more than what is in position object.

    if (this.pos.roomName === targetPos.roomName && this.pos.getRangeTo(targetPos) <= (opts?.range ?? 1)) {
      this.log.debug('MoveCreep: arrived.');
      // Arrived / Base case
      // Reset to clean, long move mode
      this.memory.stuckTicks = 0;
      this.memory.successfulAvoidMoves = 0;
      this.memory.moveMode = 'long';
      return OK_MOVE_DONE;
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
    if (this.memory.lastPos === undefined) {
      this.memory.lastPos = SerializeRoomPosition(this.pos);
      return this.pos;
    }
    return DeserializeRoomPosition(this.memory.lastPos);
  }
  set LastPos(value: RoomPosition) {
    this.memory.lastPos = SerializeRoomPosition(value);
  }

  private IncrementIdle() {
    this.memory.lifetimeIdle = this.LifetimeIdle + 1;
  }
  get LifetimeIdle(): number {
    return (this.memory.lifetimeIdle ??= 0);
  }

  private IncrementStuck() {
    this.memory.lifetimeStuck = this.LifetimeStuck + 1;
  }
  get LifetimeStuck(): number {
    return (this.memory.lifetimeStuck ??= 0);
  }

  private set IntendedToMove(value: boolean) {
    this.memory.intendedToMove = value;
  }
  get IntendedToMove(): boolean {
    return (this.memory.intendedToMove ??= false);
  }

  NewScoutingReport(): ScoutingReport {
    const dist = Game.map.getRoomLinearDistance(this.room.name, this.AssignedRoom.name);
    if (
      Memory.scoutingReports &&
      this.room.name in Memory.scoutingReports &&
      'lastSeen' in Memory.scoutingReports[this.room.name]
    )
      this.log.info('Updating scouting report.', {
        reportRoomName: this.room.name,
        distanceFromAssignedRoom: dist,
        ticksSinceLastSeen: Game.time - Memory.scoutingReports[this.room.name].lastSeen,
      });
    else this.log.info('Creating scouting report.', { reportRoomName: this.room.name, distanceFromAssignedRoom: dist });

    return { ...MakeRoomReport(this.room), scoutedFromOutpost: this.memory.room, distFromOutpost: dist };
  }

  UpdateScoutingReportForStoodInRoom(): void {
    Memory.scoutingReports ??= {};
    let newReport: ScoutingReport | undefined;

    // Create or update a new scouting report for the current room.
    if (
      this.MovedBetweenRooms ||
      !(this.room.name in Memory.scoutingReports) ||
      Memory.scoutingReports[this.room.name] === undefined ||
      Memory.scoutingReports[this.room.name].lastSeen === undefined ||
      (Game.time - Memory.scoutingReports[this.room.name].lastSeen ?? 0) > Scout.ScoutReportTTL
    )
      newReport = this.NewScoutingReport();

    if (newReport !== undefined) {
      // If we made a new report, replace the one in memory.
      Memory.scoutingReports[this.room.name] = newReport;

      // If the new report has hostiles, print a message.
      if (Game.time % 10 === 0 && newReport.hostiles && newReport.hostiles.length > 0) {
        this.log.warn('Hostiles found.', { hostiles: newReport.hostiles, room: newReport.roomName });
      }
    }
  }

  ActedThisTick = false;
  EndOfTick(): void {
    this.LastPos = this.pos;

    if (this.fatigue > 0 || this.spawning) return; // Fatigue and spawning don't count as idle

    // If we didn't move and didn't act, and aren't tired, increment the idle counter
    if (!(this.MovedBetweenRooms || this.MovedBetweenTicks || this.ActedThisTick)) this.IncrementIdle();
  }

  MovedBetweenRooms = false;
  OnLeaveRoom(): void {
    this.MovedBetweenRooms = true;
  }

  OnLastTickOfLife(): void {
    this.log.info('Creep reached its final tick.', {
      lifetimeIdle: this.LifetimeIdle,
      lifetimeStuck: this.LifetimeStuck,
    });
    this.say('☠️☠️☠️', true);
  }

  JobsAvailable = true;
  private ChangeTask(newTask = this.role.SelectNextTask(this)): CreepTask | null {
    const oldTask = this.currentTask;
    this.currentTask = newTask;

    // Log the transition as long as it's not None -> None.
    if (!newTask && oldTask) this.log.info('Task unassigned.', { oldTask });
    else if (newTask && !oldTask) this.log.info('Task assigned.', { newTask });
    else if (oldTask && newTask) this.log.info('Task reassigned.', { oldTask, newTask });

    if (newTask)
      // If the transition ended with a new task, speak its action
      this.say(newTask.action);
    else
      // If the transition was to nothing, set no jobs available
      // flag to prevent further task selecting
      this.JobsAvailable = false;

    return newTask;
  }

  CanStillAct(maxAttempts: number): boolean {
    // Don't act if we know we won't find a new job
    if (!this.JobsAvailable) return false;

    // Don't act if we already enqueued a move
    if (this.IntendedToMove) return false;

    // Don't act if we are running low on CPU,
    // So long as we've acted at least once
    if (this.tasksAttempted > 0) {
      if (Game.cpu.bucket < 100 || Game.cpu.getUsed() > Game.cpu.tickLimit * (2 / 3)) {
        this.log.warn('Low CPU, skipping further actions.', {
          bucket: Game.cpu.bucket,
          used: Game.cpu.getUsed(),
          tickLimit: Game.cpu.tickLimit,
          tasksAttempted: this.tasksAttempted,
        });
        return false;
      }
    }

    // If we have done less than the limit of tasks, then we're ok to keep trying
    return this.tasksAttempted <= maxAttempts;
  }

  DoTasks(maxAttempts = 5): void {
    for (let i = 0; i < maxAttempts; i++) {
      if (!this.CanStillAct(maxAttempts)) return;
      this.currentTask = this.DoTask(this.currentTask);
    }
  }

  private tasksAttempted = 0;
  private DoTask(currentTask: CreepTask | null): CreepTask | null {
    // Select new Task if no current one, or it's complete
    const task = currentTask === null || currentTask.isCompleteFlag ? this.ChangeTask() : currentTask;

    // Early return for no task found
    if (task === null) {
      this.say('🤷');
      return null;
    }

    const outcome = task.handleOutcome(this, task.act(this));
    this.tasksAttempted = this.tasksAttempted + 1; // Increment Tasks done

    // Handle error / movement

    if (
      outcome === null ||
      outcome === undefined ||
      outcome.result === ERR_NOT_ENOUGH_ENERGY ||
      outcome.result === ERR_NOT_ENOUGH_RESOURCES
    ) {
      // Noop
    } else if (task.isCompleteFlag || outcome.result === OK) {
      // Update non-idle flag since we acted successfully
      this.ActedThisTick = true;
    } else if (outcome.result === ERR_NOT_IN_RANGE) {
      // We have to move
      const moveResult = this.MoveCreep(outcome.target.pos, { range: outcome.range });
      if (moveResult === OK_MOVE_DONE) task.isCompleteFlag = true;
      else if (moveResult === OK) this.IntendedToMove = true;
      else if (moveResult === ERR_NO_PATH)
        // If pathfinding failed, cancel the task
        task.isCompleteFlag = true;
      else if (moveResult !== ERR_TIRED)
        // Log unhandled move result
        this.log.debug('DoTask follow-up move unhandled.', { moveResult, task, outcome, thisPos: this.pos });
    } else {
      this.log.debug('DoTask result was not ok and not a move.', { task, thisPos: this.pos, outcome });
      task.isCompleteFlag = true;
    }

    return task;
  }

  MoveIntoRoomIfOnEdge(): void {
    const awayFromEdge = DirectionIntoRoomFromEdge(EdgeStoodOn(this.pos));
    if (!awayFromEdge) return;
    if (this.move(awayFromEdge) === OK) this.IntendedToMove = true;
  }
}
