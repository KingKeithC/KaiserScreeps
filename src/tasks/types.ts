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

export interface CreepTask<Action extends string = string> {
  readonly action: Action;
  isCompleteFlag: boolean;
  toString(): string;
  act(creep: CreepExtra): TaskActionResult | null;
  handleOutcome(creep: CreepExtra, outcome: TaskActionResult | null): TaskActionResult | null;
}
