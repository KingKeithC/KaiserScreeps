import { CreepExtra } from 'Creep';
import { unique } from 'lodash';
import type { RoomExtra } from 'Room';
import { Claim, Move } from 'tasks';
import { CreepTask } from 'tasks/types';
import { GetValueByName, MakeBody } from 'utils/Collections';
import { FirstBodyByEnergyCapacity } from 'utils/RoomUtils';
import { CreepRoleBase, CreepRole } from './Role';

export class Claimer extends CreepRoleBase implements CreepRole {
  readonly groupName = 'Warriors';
  readonly roleName = 'Claimer';
  readonly priority = 2;

  PossibleBodies = [
    MakeBody([MOVE, 2], [CLAIM, 2]), // 1300
    MakeBody([MOVE, 1], [CLAIM, 1]), // 650
  ];

  GetNewCreepBody(room: RoomExtra): BodyPartConstant[] {
    return FirstBodyByEnergyCapacity(room, ...this.PossibleBodies) ?? this.PossibleBodies[-1];
  }

  private dontSpawnBefore: { [roomName: RoomExtra['name']]: number } = {};

  IsSpawnNeeded(room: RoomExtra): boolean {
    if (!this.IsRoleUnderQuota(room)) return false;
    const dontSpawnHereBefore = GetValueByName(this.dontSpawnBefore, room, () => Game.time);
    if (dontSpawnHereBefore > Game.time) return false;
    return this.UnworkedClaims(room).length > 0;
  }

  override GetMaxQuota(): number {
    return 1;
  }

  override GetMinQuota(): number {
    return 0;
  }

  override GetQuotaChange(): number {
    return 1;
  }

  WorkedClaims(): string[] {
    return unique([...this.colony.AssignedTasks(Claim)].map(p => p.targetId));
  }

  PotentialClaims(): string[] {
    const claimFlags = Object.values(Game.flags).filter(f => f.name.startsWith('Claim'));
    return unique(this.colony.AllClaimedNearby.concat(claimFlags.map(f => f.pos.roomName)));
  }

  UnworkedClaims(room: RoomExtra): string[] {
    const worked = this.WorkedClaims().filter(c => room.ClaimedNearby.includes(c));
    const ret = [];
    for (const claim of this.PotentialClaims()) {
      if (room.ClaimedByOtherRoomsInThisColony.includes(claim)) continue;

      const claimedRoom = Game.rooms[claim];
      if (worked.includes(claim)) continue;
      else if (
        GetValueByName(this.dontSpawnBefore, room, () => Game.time) <= Game.time &&
        claimedRoom &&
        claimedRoom.controller?.owner !== undefined &&
        claimedRoom.controller.owner.username !== this.colony.username &&
        claimedRoom.controller.safeMode !== undefined
      ) {
        this.log.warn('Claimed room in safe mode, delaying spawn and lowering quota.');
        this.ChangeQuota(room, -1, false);
        this.dontSpawnBefore[room.name] = Game.time + claimedRoom.controller.safeMode;
        continue;
      } else ret.push(claim);
    }
    return ret;
  }

  override SelectNextTask(creep: CreepExtra): CreepTask | null {
    for (const c of this.UnworkedClaims(creep.AssignedRoom))
      if (c in Game.rooms) {
        const controller = Game.rooms[c].controller;
        if (controller !== undefined) return new Claim(controller, false);
      } else {
        const exit = creep.room.findExitTo(c);
        if (exit === ERR_NO_PATH || exit === ERR_INVALID_ARGS) return null;
        const expitPos = creep.pos.findClosestByPath(exit);
        if (!expitPos) return null;

        // Set the entry pos to be 2 linear tiles toward the exit dir
        const entryPos = new RoomPosition(expitPos.x, expitPos.y, c);
        if (expitPos.y === 0)
          // MOVE UP
          entryPos.y = 48;
        else if (expitPos.x === 49)
          // MOVE RIGHT
          entryPos.x = 1;
        else if (expitPos.y === 49)
          // MOVE DOWN
          entryPos.y = 1;
        else if (expitPos.x === 0)
          // LEFT
          entryPos.x = 48;

        return new Move(entryPos, 0);
      }
    return null;
  }
}
