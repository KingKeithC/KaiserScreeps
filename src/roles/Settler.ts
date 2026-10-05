import { CreepExtra } from "Creep";
import { unique } from "lodash";
import { RoomExtra } from "Room";
import { RoomRole } from "./Role";

class SettlerMemory extends Object {
  claimedRoom?: string;
  reserve?: boolean;
}

export class Settler extends RoomRole<SettlerMemory> {
  static readonly RoleName: string = "Settler";
  BodyParts = [MOVE, MOVE, WORK, CLAIM];

  CountPerRoom = 1;
  override get GlobalCount(): number { return this.FindClaimedRooms().length; }

  get InitialJobMemory(): SettlerMemory {
    return ({
      claimedRoom: this.FindClaimedRooms().pop()?.name,
    });
  };

  FindClaimedRooms(): RoomExtra[] {
    const claimedRooms = Object.values(Game.flags)
      .filter(f => f.name.startsWith("Claim") && f.room != undefined)
      .map(f => new RoomExtra(f.room!));
    return unique(claimedRooms);
  }

  TickCreep(creep: CreepExtra, task: SettlerMemory): void {
    // Do nothing if no claim
    if (!task.claimedRoom) {
      if (Game.time % 20 === 0) console.log(`[${this.manager.room.name}][${creep.name}]: I have no claim!`);
      return;
    }

    // Get the claimed room object
    const claimed = new RoomExtra(Game.rooms[task.claimedRoom]);
    if (!claimed) {
      console.log(`[${this.manager.room.name}][${creep.name}]: Claimed room is not accessible.`);
      return;
    }

    // Get the claimed room's controller
    if (!claimed.controller) {
      console.log(`[${this.manager.room.name}][${creep.name}]: Claimed room has no controller.`);
      return;
    }

    // Move until in range of the controller
    if (creep.MoveCreep(claimed.controller, { range: 1 }) !== 1) return;

    if (task.reserve != undefined && task.reserve) {
      console.log(`[${this.manager.room.name}][${creep.name}]: Reserving controller in ${claimed.name} (${claimed.controller.reservation?.ticksToEnd}).`);
      creep.reserveController(claimed.controller);
    } else {
      console.log(`[${this.manager.room.name}][${creep.name}]: Claiming controller in ${claimed.name} (${claimed.controller.progress} / ${claimed.controller.progressTotal}).`);
      creep.claimController(claimed.controller);
    }
  }
}
