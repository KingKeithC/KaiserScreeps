import type { CreepExtra } from 'Creep';
export interface TaskClass<Task extends CreepTask = CreepTask> {
  readonly action: Task['action'];
  readonly prototype: Task;
}

export const TaskPrototypes = new Map<string, CreepTask>();

export function RegisterTask<Task extends CreepTask>(taskClass: TaskClass<Task>): void {
  const { action, prototype } = taskClass;
  if (TaskPrototypes.has(action)) throw new Error(`Task prototype already registered for ${action}.`);
  TaskPrototypes.set(action, prototype);
}

export function DeserializeTask(value: unknown): CreepTask | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') throw new Error(`Creep Task is not null or object.`);
  if (!('action' in value) || typeof value.action !== 'string')
    throw new Error(`Creep Task contains no valid 'action' property.`);
  const action = value.action;
  const taskPrototype = TaskPrototypes.get(action);
  if (!taskPrototype) throw new Error(`No Prototype for ${action} exists.`);
  const task = Object.assign({}, value) as CreepTask;
  Object.setPrototypeOf(task, taskPrototype);
  return task;
}

export interface TaskActionResult {
  target: { pos: RoomPosition };
  result: number;
  range: number;
}

export const CreepActionRanges = {
  attack: 1,
  attackController: 1,
  build: 3,
  claimController: 1,
  dismantle: 1,
  generateSafeMode: 1,
  harvest: 1,
  heal: 1,
  pickup: 1,
  pull: 1,
  rangedAttack: 3,
  rangedHeal: 3,
  rangedMassAttack: 3,
  repair: 3,
  reserveController: 1,
  transfer: 1,
  upgradeController: 3,
  withdraw: 1,
};

export interface CreepTask {
  readonly action: string;
  isCompleteFlag: boolean;
  toString(): string;
  act(creep: CreepExtra): TaskActionResult | null;
  handleOutcome(creep: CreepExtra, outcome: TaskActionResult | null): TaskActionResult | null;
}

export abstract class TaskBase {
  public readonly action: string;

  protected constructor() {
    const action = (this.constructor as { action?: string }).action;
    if (action === undefined) throw new Error('Task action is not registered.');
    this.action = action;
  }

  protected abstract toStringDetails(): string;

  public toString(): string {
    return `${this.action} ${this.toStringDetails()}`;
  }
}

export type Targetable = _HasId & _HasRoomPosition;
