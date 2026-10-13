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
    // If no controller, or not-neutral, we can't act.
    if (!cont) return null;

    var outcome;
    if (this.reserve)
      outcome = this.perform(cont, 1, contr => creep.reserveController(cont));
    else
      outcome = this.perform(cont, 1, contr => creep.claimController(cont));

    // Ensure this room is added to the claim list for our assigned room
    if (outcome != null && outcome.result === OK && !(creep.room.name in creep.AssignedRoom.ClaimedNearbyRooms))
      creep.AssignedRoom.ClaimedNearbyRooms = creep.AssignedRoom.ClaimedNearbyRooms.concat(creep.room.name);

    if (outcome != null && outcome.result === ERR_INVALID_TARGET && cont.owner != null && cont.owner.username !== creep.owner.username)
      outcome.result = OK; // Ignore ERR_INVALID_TARGET, which occurs when the room is not neutral

    return outcome;
  }
}
