import type { CreepExtra } from "Creep";
import { TaskAction } from "./TaskAction";
import { BaseTask, TargetTask } from "./BaseTask";
import type { TaskActionResult, TravelPath } from "./types";

export class ClaimRoomTask extends TargetTask<typeof TaskAction.Claim, string> {
  public readonly kind = "claim" as const;

  public constructor(
    public readonly roomName: string,
    public readonly claim = false,
  ) {
    super(TaskAction.Claim, roomName, "room");
  }

  public isComplete(creep: CreepExtra): boolean {
    // If we are in the target room, and own its controller, then we are done.
    return creep.room.name === this.roomName
      && (creep.room.controller != undefined)
      && (creep.room.controller.owner != undefined)
      && creep.room.controller.owner.username === creep.owner.username;
  }

  public act(creep: CreepExtra): TaskActionResult | null {
    // If claimed room inaccessible, move to dummy target in claimed room.
    if (!(this.roomName in Game.rooms)) {
      return { range: 10, target: { pos: new RoomPosition(25, 25, this.roomName) }, result: ERR_NOT_IN_RANGE };
    }

    // If claimed room has no controller, return null
    const controller = Game.rooms[this.roomName].controller;
    if (!controller) return null;

    // We can perform the action:
    //   - If the room is owned, attack the claim
    //   - If the room is neutral, reserve it by default
    //    - otherwise, claim it
    var outcome: TaskActionResult;
    if (controller.owner != undefined && controller.owner.username !== creep.owner.username)
      outcome = { range: 1, result: creep.attackController(controller), target: controller };
    else if (this.claim) {
      outcome = { range: 1, result: creep.claimController(controller), target: controller };
      if (outcome != null && outcome.result === OK) creep.AssignedRoom.colony.OnRoomSuccessfullyClaimed(creep.room);
    } else
      outcome = { range: 1, result: creep.reserveController(controller), target: controller };

    // Ensure this room is added to the claim list for our assigned room
    if (outcome != null && outcome.result === OK && !(creep.room.name in creep.AssignedRoom.ClaimedNearbyRooms))
      creep.AssignedRoom.ClaimedNearbyRooms = creep.AssignedRoom.ClaimedNearbyRooms.concat(creep.room.name);

    if (outcome != null && outcome.result === ERR_TIRED)
      outcome.result = ERR_NOT_IN_RANGE; // Ignore ERR_TIRED, which occurs if the "Upgrade blocked" timer is running, use ERR_NOT_IN_RANGE to force a move

    return outcome;
  }
}
