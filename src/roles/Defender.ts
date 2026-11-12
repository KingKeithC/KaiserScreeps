import { CreepExtra } from 'Creep';
import { flatten, groupBy } from 'lodash';
import type { RoomExtra } from 'Room';
import { Dismantle, GuardTask } from 'tasks';
import { Attack } from 'tasks/Attack';
import { CreepTask } from 'tasks/types';
import { Filters, MakeBody } from 'utils/Collections';
import { CreepRoleBase, CreepRole } from './Role';

export class Defender extends CreepRoleBase implements CreepRole {
  readonly groupName = 'Warriors';
  readonly roleName = 'Defender';
  readonly priority = 2;

  GetNewCreepBody(): BodyPartConstant[] {
    return MakeBody([TOUGH, 2], [ATTACK, 2], [MOVE, 3], [HEAL, 1]);
  }

  IsSpawnNeeded(room: RoomExtra): boolean {
    return this.IsRoleUnderRoomQuota(room);
  }

  // 1 For each hostile
  override GetMinQuota(room: RoomExtra): number {
    const allHostiles = flatten(room.WorkableClaimedRooms.map(wcr => wcr.find(FIND_HOSTILE_CREEPS))).length;
    if (allHostiles >= room.MinHostilesForResponse) return allHostiles;
    return 0;
  }

  public SelectNextTask(creep: CreepExtra): CreepTask | null {
    const hostile = this.FindNearestHostile(creep);
    if (hostile) return new Attack(hostile);

    const hostileStructure = this.FindSameRoomHostileStructure(creep);
    if (hostileStructure) return new Dismantle(hostileStructure);

    const rampart = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, { filter: Filters.StructureRampart });
    if (rampart) return new GuardTask(rampart);

    return null;
  }

  public OnSpawn(creep: CreepExtra): void {
    creep.notifyWhenAttacked(false);
  }

  TickCreep(creep: CreepExtra): void {
    this.AttackOrHeal(creep);
  }

  FindLeastTargetedHostile(room: RoomExtra): Creep | null {
    const attacksByTarget = groupBy([...room.AssignedTasks(Attack)], a => a.target);
    for (const [_, creeps] of room.HostilesByRoom)
      for (const c of creeps) if ((attacksByTarget[c.id] ?? []).length === 0) return c;
    return null;
  }

  FindNearestHostile(creep: CreepExtra): Creep | null {
    // Find Hostiles in the current room
    for (const [room, creeps] of creep.AssignedRoom.HostilesByRoom) {
      const roomName = room instanceof Room ? room.name : room;
      if (roomName === creep.room.name) {
        const found = creep.pos.findClosestByPath(creeps, {
          costCallback: (rn: string, cm: CostMatrix) => creep.CostCallback(rn, cm),
        });
        if (found) return found;
      }
    }
    return null;
  }

  FindSameRoomHostileStructure(creep: CreepExtra): AnyOwnedStructure | null {
    const structures = flatten(Object.values(creep.AssignedRoom.HostileStructuresByOwner));
    const closest = creep.pos.findClosestByPath(structures, {
      costCallback: (rn: string, cm: CostMatrix) => creep.CostCallback(rn, cm, false),
    });
    if (closest) return closest;
    return null;
  }
}
