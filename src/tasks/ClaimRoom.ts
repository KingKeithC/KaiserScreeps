import type { CreepExtra } from "Creep";
import { TaskAction } from "./TaskAction";
import { BaseTask, TargetTask } from "./BaseTask";
import type { TaskActionResult, TravelPath } from "./types";

export class ClaimRoomTask extends TargetTask<typeof TaskAction.Claim, string> {
  public readonly kind = "claim" as const;

  public constructor(
    public readonly roomName: string,
    public readonly reserve = false,
  ) {
    super(TaskAction.Claim, roomName, "room");
  }

  public isComplete(_creep: CreepExtra): boolean {
    return false;
  }

  public act(creep: CreepExtra): TaskActionResult | null {
    if (creep.room.name !== this.roomName) // Not in controller room, move to dummy target in room
      return { range: 25, target: { pos: new RoomPosition(25, 25, this.roomName) }, result: ERR_NOT_IN_RANGE };

    const cont = creep.room.controller;
    if (!cont) return null;

    if (this.reserve)
      return this.perform(cont, 1, contr => creep.reserveController(cont));
    else
      return this.perform(cont, 1, contr => creep.claimController(cont));
  }
}
