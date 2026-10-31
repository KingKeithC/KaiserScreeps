import { CreepExtra } from 'Creep';

export const TaskAction = {
  Mine: '⛏️',
  Collect: '🔌',
  MaintainController: '🦸‍♀️',
  Build: '🏗️',
  Repair: '🛠️',
  Supply: '🫴',
  UpgradeController: '🔼',
  Pickup: '🧹',
  Attack: '⚔️',
  Guard: '🛡️',
  Scout: '👀',
  Claim: '🏁',
  Move: '👣',
  ExitRoom: '🚪',
  Dismantle: '🔱',
} as const;

export interface TaskActionResult {
  target: { pos: RoomPosition };
  result: number;
  range: number;
}

export interface CreepTask<Action extends string = string> {
  readonly action: Action;
  isCompleteFlag: boolean;
  toString(): string;
  act(creep: CreepExtra): TaskActionResult | null;
  handleOutcome(creep: CreepExtra, outcome: TaskActionResult | null): TaskActionResult | null;
}
