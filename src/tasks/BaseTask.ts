import type { CreepExtra } from "Creep";
import type { CreepTask, TaskActionResult } from "./types";

export abstract class BaseTask<Action extends string> implements CreepTask<Action> {
  public constructor(public readonly action: Action) { }

  public toString(): string { return this.action; }

  public isComplete(_creep: CreepExtra): boolean { return false; }

  public act(_creep: CreepExtra): TaskActionResult | null { return null; }

  protected perform<Target extends RoomObject>(
    target: Target | null,
    range: number,
    action: (target: Target) => number,
  ): TaskActionResult | null {
    return target ? { target, range, result: action(target) } : null;
  }
}

export abstract class TargetTask<Action extends string, Target> extends BaseTask<Action> {
  public constructor(
    action: Action,
    public readonly target: Target,
    private readonly targetType = "target",
  ) {
    super(action);
  }

  public toString(): string {
    const target = Game.getObjectById(this.target as Id<Source>);
    return `${this.action} on ${target ? String(target) : `[${this.targetType} ${JSON.stringify(this.target)}]`}`;
  }

  protected resolveTarget(): RoomObject | null {
    return Game.getObjectById(this.target as Id<Source>) as RoomObject | null;
  }
}
