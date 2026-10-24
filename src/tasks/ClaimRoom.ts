import { CreepExtra } from "Creep";
import { unique } from "lodash";
import { TargetTask } from "./TargetTask";
import { TaskAction } from "./TaskAction";
import { TaskActionResult } from "./types";


export class ClaimRoomTask extends TargetTask<typeof TaskAction.Claim, string> {
  public readonly kind = "claim" as const;

  public constructor(
    roomName: string,
    public readonly claim = false,
  ) {
    super(TaskAction.Claim, roomName, "room");
  }

  public isComplete(creep: CreepExtra): boolean {
    // If we are in the target room, and own its controller, then we are done.
    return creep.room.name === this.target
      && (creep.room.controller !== undefined)
      && (creep.room.controller.owner !== undefined)
      && creep.room.controller.owner.username === creep.owner.username;
  }

  public act(creep: CreepExtra): TaskActionResult | null {
    // If claimed room inaccessible, move to dummy target in claimed room.
    if (!(this.target in Game.rooms)) {
      return { range: 20, target: { pos: new RoomPosition(25, 25, this.target) }, result: ERR_NOT_IN_RANGE };
    }

    // If claimed room has no controller, return null
    const controller = Game.rooms[this.target].controller;
    if (!controller) return null;

    // We can perform the action:
    //   - If the room is owned, attack the claim
    //   - If the room is neutral, reserve it by default
    //    - otherwise, claim it
    const ownedRoomCount = Object.values(Game.rooms).filter(r => r.controller?.my).length;
    const claimableCount = Game.gcl.level - ownedRoomCount;
    let outcome: TaskActionResult;
    if (this.claim && claimableCount > 0) {
      outcome = { range: 1, result: creep.claimController(controller), target: controller };
      if (outcome != null && outcome.result === OK) creep.AssignedRoom.colony.OnRoomSuccessfullyClaimed(creep.room);
    } else if (controller.owner !== undefined && controller.owner.username !== creep.owner.username)
      outcome = { range: 1, result: creep.attackController(controller), target: controller };
    else
      outcome = { range: 1, result: creep.reserveController(controller), target: controller };

    // Ensure this room is added to the claim list for our assigned room
    if (outcome != null && outcome.result === OK)
      creep.colony.StakeClaimOnRoom(creep, creep.pos.roomName);

    if (outcome != null && outcome.result === ERR_TIRED)
      outcome.result = ERR_NOT_IN_RANGE; // Ignore ERR_TIRED, which occurs if the "Upgrade blocked" timer is running, use ERR_NOT_IN_RANGE to force a move

    return outcome;
  }
}
