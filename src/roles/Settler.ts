import { CreepExtra } from "Creep";
import type { RoomExtra } from "Room";
import { CreepTask, Idle } from "Tasks";
import { ClaimRoomTask } from "Tasks";
import { CreepRole, CreepRoleBase } from "./Role";

export class Settler extends CreepRoleBase implements CreepRole {
  readonly groupName = "Settlers";
  readonly name = "Settler";
  readonly tier = 1;

  GetNewCreepBody(_room: RoomExtra): BodyPartConstant[] {
    return [MOVE, MOVE, WORK, CLAIM];
  }

  override GetInitialTask(_room: RoomExtra): CreepTask {
    const roomName = this.FindClaimedRooms().pop();
    return roomName ? new ClaimRoomTask(roomName) : new Idle();
  }

  override GetRoomQuota(_room: RoomExtra): number { return 0; }

  SelectNextTask(creep: CreepExtra, room: RoomExtra): CreepTask {
    const targetRoom = this.FindNextClaimTarget(room);
    return targetRoom ? new ClaimRoomTask(targetRoom) : new Idle();
  }

  public TaskAct(creep: CreepExtra, task: CreepTask, room: RoomExtra): void {
    if (task.kind !== "claim" && task.kind !== "reserve") return;
    if (!("roomName" in task) || typeof task.roomName !== "string") return;
    if (!task.roomName) return;

    if (creep.room.name !== task.roomName) {
      const pos = new RoomPosition(25, 25, task.roomName);
      const moveResult = creep.MoveCreep(pos, { range: 20 });
      if (moveResult !== OK) this.log.info(`Moving to ${JSON.stringify(pos)} resulted in ${moveResult}`);
      return;
    }

    const claimed = Game.rooms[task.roomName];
    if (!claimed) {
      this.log.info(`[${room.name}][${creep.name}]: We still don't have access to the claimed room.`);
      return;
    }

    if (!claimed.controller) {
      this.log.info(`[${room.name}][${creep.name}]: Claimed room has no controller.`);
      return;
    }

    const moveRes = creep.MoveCreep(claimed.controller, { range: 1 });
    if (moveRes === 0) return;
    if (moveRes < 0) {
      this.log.info(`[${room.name}][${creep.name}]: Failed to move to room controller: ${moveRes}`);
      return;
    }

    if (task.kind === "reserve") {
      const result = creep.reserveController(claimed.controller);
      this.log.info(`[${room.name}][${creep.name}]: Reserving controller in ${claimed.name} (${claimed.controller.reservation?.ticksToEnd}), result ${result}.`);
    } else {
      const result = creep.claimController(claimed.controller);
      this.log.info(`[${room.name}][${creep.name}]: Claiming controller in ${claimed.name} (${claimed.controller.progress} / ${claimed.controller.progressTotal}), result ${result}.`);
    }
  }

  FindClaimedRooms(): string[] {
    const claimedRooms = Object.values(Game.flags)
      .filter(f => f.name.startsWith("Claim"))
      .map(f => f.pos.roomName);
    return [...new Set(claimedRooms)];
  }

  FindNextClaimTarget(room: RoomExtra): string | null {
    const assignedRooms = new Set<string>();
    for (const creep of room.find(FIND_MY_CREEPS, { filter: candidate => candidate.memory.role === this.name }) as CreepExtra[]) {
      const task = creep.currentTask;
      if (task?.kind === "claim" || task?.kind === "reserve") {
        const roomName = (task as { roomName?: string; }).roomName;
        if (roomName) assignedRooms.add(roomName);
      }
    }

    for (const roomName of [...this.FindClaimedRooms()].reverse()) {
      if (assignedRooms.has(roomName)) continue;
      const targetRoom = Game.rooms[roomName];
      if (targetRoom?.controller?.my) continue;
      return roomName;
    }
    return null;
  }
}
