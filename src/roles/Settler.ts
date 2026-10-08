import { CreepExtra } from "Creep";
import { unique } from "lodash";
import { RoomRole } from "./Role";

class SettlerMemory extends Object {
  reserve?: boolean;
  claimedRoom?: string;
  pathToClaim?: { exit: ExitConstant; room: string; }[];
  currentTarget?: RoomPosition | DirectionConstant;
}

export class Settler extends RoomRole<SettlerMemory> {
  static readonly RoleName: string = "Settler";
  BodyParts = [MOVE, MOVE, WORK, CLAIM];

  CountPerRoom = 0;
  override get GlobalCount(): number { return this.FindClaimedRooms().length; }

  get InitialJobMemory(): SettlerMemory {
    return ({
      claimedRoom: this.FindClaimedRooms().pop(),
    });
  };

  FindClaimedRooms(): string[] {
    const claimedRooms = Object.values(Game.flags)
      .filter(f => f.name.startsWith("Claim"))
      .map(f => f.pos.roomName);
    return unique(claimedRooms);
  }

  TickCreep(creep: CreepExtra, task: SettlerMemory): void {
    // Do nothing if no claim
    if (!task.claimedRoom) {
      if (Game.time % this.NotificationInterval === 0) this.log.info(`[${this.manager.room.name}][${creep.name}]: I have no claim!`);
      return;
    }

    // Find an path from our current room to the claimed room
    if (!task.pathToClaim) {
      const route = Game.map.findRoute(creep.room.name, task.claimedRoom);
      if (route === -2) {
        this.log.info(`[${this.manager.room.name}][${creep.name}]: Could not find route to claimed room.`);
        return;
      }
      this.log.info(`[${this.manager.room.name}][${creep.name}]: Found path to claim: ${JSON.stringify(route)}`);
      task.pathToClaim = route;
      creep.memory.jobMemory = task;
    }

    // Move until we are in the claimed room
    if (creep.room.name !== task.claimedRoom) {
      // Construct a dummy position in the centre of the room and move there
      const pos = new RoomPosition(25, 25, task.claimedRoom);
      const moveRes = creep.MoveCreep(pos, { range: 20 });
      if (moveRes !== OK) this.log.info(`Moving to ${JSON.stringify(pos)} resulted in ${moveRes}`);
    }

    // We should be in the claimed room by now, get a reference to it
    const claimed = Game.rooms[task.claimedRoom];
    if (!claimed) {
      this.log.info(`[${this.manager.room.name}][${creep.name}]: We still don't have access to the claimed room.`);
      return;
    } else {
      this.log.info(`[${this.manager.room.name}][${creep.name}]: Can access room, trying to access controller...`);
    }

    // Get a reference to the controller in the room
    if (!claimed.controller) {
      this.log.info(`[${this.manager.room.name}][${creep.name}]: Claimed room has no controller.`);
      return;
    } else {
      this.log.info(`[${this.manager.room.name}][${creep.name}]: Proceeding to controller...`);
    }

    // Move to the controller
    const moveRes = creep.MoveCreep(claimed.controller, { range: 1 });
    if (moveRes === 0)
      return; // Moving
    else if (moveRes < 0) { // Error
      this.log.info(`[${this.manager.room.name}][${creep.name}]: Failed to move to room controller: ${moveRes}`);
      return;
    }

    // Act on the controller
    if (task.reserve != undefined && task.reserve) {
      const res = creep.reserveController(claimed.controller);
      this.log.info(`[${this.manager.room.name}][${creep.name}]: Reserving controller in ${claimed.name} (${claimed.controller.reservation?.ticksToEnd}), result ${res}.`);
    } else {
      const res = creep.claimController(claimed.controller);
      this.log.info(`[${this.manager.room.name}][${creep.name}]: Claiming controller in ${claimed.name} (${claimed.controller.progress} / ${claimed.controller.progressTotal}), result ${res}.`);
    }
  }
}
