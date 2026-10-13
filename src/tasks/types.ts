import type { CreepExtra } from "Creep";

export interface TaskActionResult {
  target: { pos: RoomPosition; };
  result: number;
  range: number;
}

export interface CreepTask<Action extends string = string> {
  readonly action: Action;
  toString(): string;
  isComplete(creep: CreepExtra): boolean;
  act(creep: CreepExtra): TaskActionResult | null;
}

export type TravelPath = { exit: ExitConstant; room: string; }[];
export type EnergySource =
  | { kind: "creep"; name: string; }
  | { kind: "container"; id: Id<StructureContainer>; };
