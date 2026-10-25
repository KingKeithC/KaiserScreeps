/* eslint-disable @typescript-eslint/no-unused-vars */
import { CreepExtra } from 'Creep';
import type { CreepTask, TaskActionResult } from './types';

export abstract class BaseTask<Action extends string> implements CreepTask<Action> {
  public constructor(public readonly action: Action) {}

  public toString(): string {
    return this.action;
  }

  public isComplete(_creep: CreepExtra): boolean {
    return false;
  }

  public act(_creep: CreepExtra): TaskActionResult | null {
    return null;
  }

  protected perform<Target extends RoomObject>(
    target: Target | null,
    range: number,
    action: (target: Target) => number,
  ): TaskActionResult | null {
    return target ? { target, range, result: action(target) } : null;
  }
}
