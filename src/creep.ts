import { Colours } from "data";
import { sum } from "lodash";

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

  MoveLong(dest: RoomPosition | { pos: RoomPosition; }, opts?: MoveToOpts): number {
    return this.moveTo(dest, {
      ...opts,
      visualizePathStyle: { stroke: Colours.PATH_LONG, lineStyle: "solid" },
      ignoreCreeps: true,
      maxOps: this.MaxPathfindingOps,

    });
  }

  MoveAvoidCreeps(dest: RoomPosition | { pos: RoomPosition; }, opts?: MoveToOpts): number {
    return this.moveTo(dest, {
      ...opts,
      visualizePathStyle: { stroke: Colours.PATH_STUCK, lineStyle: "dotted" },
      ignoreCreeps: false,
      maxOps: this.MaxPathfindingOps,
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
      return 1;
    }

    // Increment counters
    if (this.memory.moveMode === "avoidCreeps" && movedBetweenTicks) {
      this.memory.successfulAvoidMoves++;
    } else if (this.memory.moveMode === "long" && !movedBetweenTicks && this.fatigue === 0) {
      this.memory.stuckTicks++;
    } else if (this.memory.moveMode === "long" && movedBetweenTicks) {
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

    // Invoke the actual move
    return this.memory.moveMode === "long"
      ? this.MoveLong(target, opts)
      : this.MoveAvoidCreeps(target, opts);
  }
}
