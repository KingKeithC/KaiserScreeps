import { Colours } from "Data";
import { sum } from "lodash";
import { Logger } from "utils/Logger";

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

  MaxStuckTicks: number = 2;
  MaxAvoidTicks: number = 3;
  MaxPathfindingOps: number = 200;

  static BodyCost(body: BodyPartConstant[]): number { return sum(body.map(p => BODYPART_COST[p])); }

  static FindWithRole(roleName: string): CreepExtra[] {
    return Object.values(Game.creeps)
      .filter(c => c.my && !c.spawning && c.memory.role == roleName)
      .map(c => new CreepExtra(c.id));
  }

  private readonly log = new Logger(this, { formatArgs: { "<creep>": this } });

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
}
