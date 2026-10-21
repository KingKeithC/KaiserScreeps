import { BaseTask } from "./BaseTask";

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
