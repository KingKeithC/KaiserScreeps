import { CreepExtra } from "Creep";
import { countBy, groupBy, some } from "lodash";
import { RoomExtra } from "Room";
import { CreepTask, Move } from "tasks";
import { Idle } from "tasks";
import { GetMinerPositions, MakeBody, SerializeRoomPosition } from "utils/Collections";
import { CreepRole, CreepRoleBase } from "./Role";

export interface ScoutingReport {
  roomName: string;
  lastSeen: number;
  owner?: string;
  scoutedFromOutpost: string,
  distFromOutput: number,
  hasController: boolean;
  numberOfSources: number;
  spacesForMiners: number;
  status: RoomStatus;
  reservation?: ReservationDefinition;
  describeExits: Partial<Record<ExitKey, string>> | null;
}


export class Scout extends CreepRoleBase implements CreepRole {
  readonly groupName = "Scouts";
  readonly name = "Scout";
  readonly tier = 1;

  RandomMoveRadius = 3;
  MaxSearchAttempts = 10;
  ScoutStuckRetargetTicks = 100;

  GetNewCreepBody(_room: RoomExtra): BodyPartConstant[] { return MakeBody([MOVE, 1]); }

  // Ensure a scout is only spawned once every `ScoutReportTTL` ticks.
  ScoutReportTTL = 2000;
  IsSpawnNeeded(room: RoomExtra): boolean { return room.LastSpawnTick(this.name) > this.ScoutReportTTL; }
  OnSpawnScheduled(room: RoomExtra, name: string): void { room.SetLastSpawnTick(this.name, Game.time); }

  GetGlobalQuota(): number { return 1; }
  GetRoomQuota(): number { return 1; }

  FindNearbyRandomRoom(creep: CreepExtra): string | null {
    for (var attempts = 0; attempts < this.MaxSearchAttempts; attempts++) {
      const roomIsNorth = creep.room.name.includes("N");
      const [hRange, roomMapYStr] = creep.room.name.split(roomIsNorth ? "N" : "S");
      const roomMapY = Number.parseInt(roomMapYStr);
      const roomIsEast = hRange.includes("E");
      const [_, roomMapXStr] = hRange.split(roomIsEast ? "E" : "W");
      const roomMapX = Number.parseInt(roomMapXStr);
      const xBias = ((2 * this.RandomMoveRadius * Math.random()) - this.RandomMoveRadius);
      const yBias = ((2 * this.RandomMoveRadius * Math.random()) - this.RandomMoveRadius);
      const newRoomMapX = Math.abs(Math.floor(roomMapX + xBias));
      const newRoomMapY = Math.abs(Math.floor(roomMapY + yBias));
      const targetRoomName = `${roomIsEast ? "E" : "W"}${newRoomMapX}${roomIsNorth ? "N" : "S"}${newRoomMapY}`;

      // Check distance
      const dist = Game.map.getRoomLinearDistance(creep.room.name, targetRoomName);
      if (dist > this.RandomMoveRadius) continue;

      // Check recency
      const lastVisitedTooRecently =
        targetRoomName in Memory.scoutingReports
        && Memory.scoutingReports[targetRoomName].lastSeen
        && (Game.time - Memory.scoutingReports[targetRoomName].lastSeen) < this.ScoutReportTTL;
      if (lastVisitedTooRecently) {
        this.log.info(`Random target ${targetRoomName} was actually visited too recently (${Game.time - Memory.scoutingReports[targetRoomName].lastSeen} < ${this.ScoutReportTTL}).`, { "<creep>": creep, "<room>": creep.room });
        continue;
      }

      this.log.info(`Journeying to ${targetRoomName} which is approx. ${dist} rooms away.`, { "<creep>": creep, "<room>": creep.room });
      return targetRoomName;
    }
    this.log.info(`No suitable destination found after ${attempts} attempts.`, { "<creep>": creep, "<room>": creep.room });
    return null;
  }

  NewScoutingReport(creep: CreepExtra): ScoutingReport {
    const dist = Game.map.getRoomLinearDistance(creep.room.name, creep.memory.room);
    const reportMsg = `${creep.room.name} (~${dist} Rooms from My Home)`;
    if (creep.room.name in Memory.scoutingReports && "lastSeen" in Memory.scoutingReports[creep.room.name])
      this.log.info(`Updating Scouting Reporting for ${reportMsg}. Last Seen ${Game.time - Memory.scoutingReports[creep.room.name].lastSeen} Ticks Ago.`, { "<creep>": creep, "<room>": creep.room });
    else
      this.log.info(`Creating Scouting Reporting for ${reportMsg}`, { "<creep>": creep, "<room>": creep.room });

    return {
      roomName: creep.room.name,
      lastSeen: Game.time,
      hasController: creep.room.controller !== undefined,
      owner: creep.room.controller?.owner?.username,
      reservation: creep.room.controller?.reservation,
      numberOfSources: creep.room.find(FIND_SOURCES).length,
      spacesForMiners: GetMinerPositions(creep.room).length,
      status: Game.map.getRoomStatus(creep.room.name),
      describeExits: Game.map.describeExits(creep.room.name),
      scoutedFromOutpost: creep.memory.room,
      distFromOutput: dist,
    };
  }

  TickCreep(creep: CreepExtra, room: RoomExtra): void {
    // Create a new scouting report for old or new rooms.
    if (!(creep.room.name in Memory.scoutingReports) || Game.time - (Memory.scoutingReports[creep.room.name].lastSeen ?? 0) > this.ScoutReportTTL)
      Memory.scoutingReports[creep.room.name] = this.NewScoutingReport(creep);

    // Retarget if we have been in this room for too long
    if (creep.room.name in Memory.scoutingReports && Game.time - (Memory.scoutingReports[creep.room.name].lastSeen ?? 0) > this.ScoutStuckRetargetTicks) {
      this.log.info(`Retargeting since we've been here too long (${Game.time - (Memory.scoutingReports[creep.room.name].lastSeen ?? 0)} > ${this.ScoutStuckRetargetTicks})`, { "<creep>": creep, "<room>": creep.room });
      Memory.scoutingReports[creep.room.name] = this.NewScoutingReport(creep); // Refresh scouting report to update lastSeen
      creep.memory.jobMemory = {}; // Force retarget
    }
  }

  SelectNextTask(creep: CreepExtra, room: RoomExtra, lastTask: CreepTask<string>): CreepTask<string> | null {
    const newRoom = this.FindNearbyRandomRoom(creep);
    if (newRoom) return new Move(new RoomPosition(25, 25, newRoom), 25);
    return new Idle();
  }
}
