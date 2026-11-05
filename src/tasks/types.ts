import type { CreepExtra } from 'Creep';
import type { Attack } from './Attack';
import type { Build } from './Build';
import type { Claim } from './Claim';
import type { Collect } from './CollectEnergy';
import type { Dismantle } from './Dismantle';
import type { GuardTask } from './Guard';
import type { Mine } from './Mine';
import type { Move } from './Move';
import type { Repair } from './Repair';
import type { Retire } from './Retire';
import type { Supply } from './Supply';
import type { UpgradeController } from './UpdateController';

export enum TaskAction {
  Mine = '⛏️',
  Collect = '🔌',
  Build = '🏗️',
  Repair = '🛠️',
  Retire = '🥀',
  Supply = '🫴',
  UpgradeController = '🔼',
  Attack = '⚔️',
  Guard = '🛡️',
  Claim = '🏁',
  Move = '👣',
  Dismantle = '🔱',
}

type RegisteredTask =
  Mine | Collect | Build | Repair | Retire | Supply | UpgradeController | Attack | GuardTask | Claim | Move | Dismantle;

export type AssignedTask<Action extends TaskAction | undefined> = Action extends TaskAction
  ? Extract<RegisteredTask, { action: Action }>
  : CreepTask;

export const TaskPrototypes = new Map<TaskAction, CreepTask>();

export function RegisterTask<Action extends TaskAction>(action: Action, prototype: CreepTask<Action>): void {
  if (TaskPrototypes.has(action)) throw new Error(`Task prototype already registered for ${action}.`);
  Object.defineProperty(prototype, 'action', { value: action, enumerable: true });
  TaskPrototypes.set(action, prototype);
}

export function DeserializeTask(value: unknown): CreepTask | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') throw new Error(`Creep Task is not null or object.`);
  if (!('action' in value) || typeof value.action !== 'string')
    throw new Error(`Creep Task contains no valid 'action' property.`);
  const action = value.action as CreepTask['action'];
  const taskPrototype = TaskPrototypes.get(action);
  if (!taskPrototype) throw new Error(`No Prototype for ${action} exists.`);
  const task = Object.assign(Object.create(taskPrototype), value) as CreepTask;
  delete (task as { action?: CreepTask['action'] }).action;
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

export interface CreepTask<Action extends TaskAction = TaskAction> {
  readonly action: Action;
  isCompleteFlag: boolean;
  toString(): string;
  act(creep: CreepExtra): TaskActionResult | null;
  handleOutcome(creep: CreepExtra, outcome: TaskActionResult | null): TaskActionResult | null;
}
