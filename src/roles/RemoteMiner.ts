import { CreepExtra } from "Creep";
import { RoomExtra } from "Room";
import { CreepTask, Mine } from "tasks";
import { MakeBody } from "utils/Collections";
import { CreepRoleBase, CreepRole } from "./Role";

export class RemoteMiner extends CreepRoleBase implements CreepRole {
  readonly groupName = "Miners";
  override readonly name: string = "RemoteMiner";
  override readonly tier: number = 1;

  IsSpawnNeeded(room: RoomExtra): boolean { return room.GetUnassignedRemoteMiningPositions().length > 0; }

  GetNewCreepBody(room: RoomExtra): BodyPartConstant[] {
    if (room.controller?.level ?? 0 > 3)
      return MakeBody(
        [CARRY, 9],
        [WORK, 5],
        [MOVE, 7],
      );
    else if (room.controller?.level === 3)
      return MakeBody(
        [CARRY, 7],
        [WORK, 3],
        [MOVE, 3],
      );
    else // level < 3
      return MakeBody(
        [CARRY, 1],
        [WORK, 1],
        [MOVE, 1],
      );
  }

  // 1 miner per remote source
  override GetRoomQuota(room: RoomExtra) { return room.GetUnassignedRemoteMiningPositions().length; }
  GetGlobalQuota(): number { return -1; }

  GetInitialTask(room: RoomExtra): CreepTask | null {
    const unassigned = room.GetUnassignedRemoteMiningPositions().pop();
    if (unassigned) {
      // Mine the source next to the unfilled position
      return new Mine(unassigned);
    }
    return null;
  }

  SelectNextTask(creep: CreepExtra, _lastTask: CreepTask<string>): CreepTask<string> | null {
    return this.GetInitialTask(creep.AssignedRoom);
  }

  TickCreep(creep: CreepExtra): void {
    // If we are in the remote room, vaccuum up energy in containers
    if (creep.room.name !== creep.AssignedRoom.name)
      this.WithdrawFromContainers(creep);

    // If we have space for energy, and there is energy below us, pick it up
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
      for (const dropped of creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, { filter: r => r.resourceType === RESOURCE_ENERGY }))
        if (dropped.resourceType === RESOURCE_ENERGY)
          creep.pickup(dropped);
  }

  WithdrawFromContainers(creep: CreepExtra): void {
    const nearbyContainer = creep.pos.findInRange(
      FIND_STRUCTURES,
      1,
      { filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0 },
    ).pop();
    if (nearbyContainer) creep.withdraw(nearbyContainer, RESOURCE_ENERGY);
  }
}
