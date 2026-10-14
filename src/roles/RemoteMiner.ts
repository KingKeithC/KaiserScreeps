import { CreepExtra } from "Creep";
import { unique } from "lodash";
import { RoomExtra } from "Room";
import { CreepTask, TaskAction, Supply, Mine, Move, Idle } from "tasks";
import { MakeBody, MiningPosition } from "utils/Collections";
import { CreepRoleBase, CreepRole } from "./Role";
import { Worker } from "./Worker";


export class RemoteMiner extends CreepRoleBase implements CreepRole {
  readonly groupName = "Miners";
  override readonly name: string = "RemoteMiner";
  override readonly tier: number = 1;

  UnfilledRemoteMiningPositions(room: RoomExtra): MiningPosition[] {
    const assignedMiningSources = room.GetAssignedTasks(TaskAction.Mine).map(p => (p as Mine).target.sourceId);

    var ret: MiningPosition[] = [];
    for (const claimedRoom of room.GetVisibleClaimedRooms())
      for (const unfilled of claimedRoom.GetUnfilledUnassignedMiningPositions())
        if (assignedMiningSources.includes(unfilled.sourceId)) continue;
        else ret.push(unfilled);
    return ret;
  }

  AllRemoteMiningPositions(room: RoomExtra): MiningPosition[] {
    var ret: MiningPosition[] = [];
    for (const r of room.GetVisibleClaimedRooms())
      ret = ret.concat(r.MinerPositions);
    return ret;
  }

  IsSpawnNeeded(room: RoomExtra): boolean {
    return this.UnfilledRemoteMiningPositions(room).length > 0;
  }

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
  override GetRoomQuota(room: RoomExtra) { return unique(this.AllRemoteMiningPositions(room).map(mp => mp.sourceId)).length; }
  GetGlobalQuota(): number { return -1; }

  SelectNextTask(creep: CreepExtra, room: RoomExtra, lastTask: CreepTask | null): CreepTask | null {
    const unfilled = this.UnfilledRemoteMiningPositions(room).pop();
    if (unfilled) {
      // Mine the source next to the unfilled position
      this.log.info(`Filling Miner Position: ${unfilled}`, { "<creep>": creep, "<room>": room });
      return new Mine(unfilled);
    }

    return null;
  }

  TickCreep(creep: CreepExtra, room: RoomExtra): void {
    // If we are in the remote room, vaccuum up energy in containers
    if (creep.room.name !== room.name)
      this.WithdrawFromContainers(creep, room);
  }

  WithdrawFromContainers(creep: CreepExtra, room: RoomExtra): void {
    const nearbyContainer = creep.pos.findInRange(
      FIND_STRUCTURES,
      1,
      { filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0 },
    ).pop();
    if (nearbyContainer) creep.withdraw(nearbyContainer, RESOURCE_ENERGY);
  }
}
