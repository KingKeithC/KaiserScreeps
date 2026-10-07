import { CreepExtra } from "Creep";
import { unique } from "lodash";
import { RoomExtra } from "Room";
import { RoomRole } from "./Role";

class SettlerMemory extends Object {
  reserve?: boolean;
  claimedRoom?: string;
  pathToClaim?: { exit: ExitConstant; room: string; }[];
  currentTarget?: RoomPosition;
}

export class Settler extends RoomRole<SettlerMemory> {
  static readonly RoleName: string = "Settler";
  BodyParts = [MOVE, MOVE, WORK, CLAIM];

  CountPerRoom = 1;
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
      if (Game.time % 20 === 0) console.log(`[${this.manager.room.name}][${creep.name}]: I have no claim!`);
      return;
    }

    // Find an path from our current room to the claimed room
    if (!task.pathToClaim) {
      const route = Game.map.findRoute(creep.room.name, task.claimedRoom);
      if (route === -2) {
        console.log(`[${this.manager.room.name}][${creep.name}]: Could not find route to claimed room.`);
        return;
      }
      console.log(`[${this.manager.room.name}][${creep.name}]: Found path to claim: ${JSON.stringify(route)}`);
      task.pathToClaim = route;
      creep.memory.jobMemory = task;
    }

    if (creep.room.name === task.claimedRoom) {
      const claimed = Game.rooms[task.claimedRoom];
      if (!claimed) {
        console.log(`[${this.manager.room.name}][${creep.name}]: We still don't have access to the claimed room.`);
        return;
      }

      if (!claimed.controller) {
        console.log(`[${this.manager.room.name}][${creep.name}]: Claimed room has no controller.`);
        return;
      }

      const moveRes = creep.MoveCreep(claimed.controller, { range: 1 });
      if (moveRes !== 1) {
        console.log(`[${this.manager.room.name}][${creep.name}]: Failed to move to room controller: ${moveRes}`);
        return;
      }

      if (task.reserve != undefined && task.reserve) {
        console.log(`[${this.manager.room.name}][${creep.name}]: Reserving controller in ${claimed.name} (${claimed.controller.reservation?.ticksToEnd}).`);
        creep.reserveController(claimed.controller);
      } else {
        console.log(`[${this.manager.room.name}][${creep.name}]: Claiming controller in ${claimed.name} (${claimed.controller.progress} / ${claimed.controller.progressTotal}).`);
        creep.claimController(claimed.controller);
      }

    } else {
      if (!task.currentTarget) {
        const exitPos = creep.pos.findClosestByPath(task.pathToClaim[0].exit);
        if (!exitPos) {
          console.log(`[${this.manager.room.name}][${creep.name}]: Could not find path to ${task.pathToClaim[0].room} exit: ${task.pathToClaim[0].exit}...`);
          return;
        }
        task.currentTarget = exitPos;
        creep.memory.jobMemory = task;
      }

      const pos = task.currentTarget as RoomPosition;
      const moveRes = creep.MoveCreep(pos, { range: 0 });
      if (moveRes === ERR_INVALID_TARGET) {
        delete task.currentTarget;
        creep.memory.jobMemory = task;
        return;
      } else if (moveRes !== 1) {
        console.log(`[${this.manager.room.name}][${creep.name}]: To Target ${JSON.stringify(pos)}: ${moveRes}`);
      }
    }
  }
}
