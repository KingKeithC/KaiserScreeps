import { CreepExtra } from "Creep";
import { RoomExtra } from "Room";
import { CreepTask, Move } from "tasks";
import { MakeBody } from "utils/Collections";
import { FormatHostileInfos, RoomReport, MakeRoomReport } from "utils/RoomUtils";
import { CreepRoleBase, CreepRole } from "./Role";

export interface ScoutingReport extends RoomReport {
  scoutedFromOutpost?: string,
  distFromOutpost?: number,
}


export class Scout extends CreepRoleBase implements CreepRole {
  readonly groupName = "Scouts";
  readonly name = "Scout";

  RandomMoveRadius = 3;
  MaxSearchAttempts = 10;
  ScoutStuckRetargetTicks = 100;

  GetNewCreepBody(): BodyPartConstant[] { return MakeBody([MOVE, 1]); }

  // Ensure a scout is only spawned once every `ScoutReportTTL` ticks.
  ScoutReportTTL = 2000;
  IsSpawnNeeded(room: RoomExtra): boolean { return (Game.time - room.LastSpawnTick(this.name)) > this.ScoutReportTTL; }
  OnSpawnScheduled(room: RoomExtra): void { room.SetLastSpawnTick(this.name, Game.time); }

  GetGlobalQuota(): number { return 1; }
  GetRoomQuota(): number { return 1; }

  FindNearbyRandomRoom(creep: CreepExtra): string | null {
    for (let attempts = 0; attempts < this.MaxSearchAttempts; attempts++) {
      const roomIsNorth = creep.room.name.includes("N");
      const [hRange, roomMapYStr] = creep.room.name.split(roomIsNorth ? "N" : "S");
      const roomMapY = Number.parseInt(roomMapYStr, 10);
      const roomIsEast = hRange.includes("E");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, roomMapXStr] = hRange.split(roomIsEast ? "E" : "W");
      const roomMapX = Number.parseInt(roomMapXStr, 10);
      const xBias = ((2 * this.RandomMoveRadius * Math.random()) - this.RandomMoveRadius);
      const yBias = ((2 * this.RandomMoveRadius * Math.random()) - this.RandomMoveRadius);
      const newRoomMapX = Math.abs(Math.floor(roomMapX + xBias));
      const newRoomMapY = Math.abs(Math.floor(roomMapY + yBias));
      const targetRoomName = `${roomIsEast ? "E" : "W"}${newRoomMapX}${roomIsNorth ? "N" : "S"}${newRoomMapY}`;

      // Check distance
      const dist = Game.map.getRoomLinearDistance(creep.room.name, targetRoomName);
      if (dist > this.RandomMoveRadius) continue;

      // Check recency
      if (Memory.scoutingReports) {
        const lastVisitedTooRecently =
          targetRoomName in Memory.scoutingReports
          && Memory.scoutingReports[targetRoomName].lastSeen
          && (Game.time - Memory.scoutingReports[targetRoomName].lastSeen) < this.ScoutReportTTL;
        if (lastVisitedTooRecently) {
          this.log.info(`Random target ${targetRoomName} was actually visited too recently (${Game.time - Memory.scoutingReports[targetRoomName].lastSeen} < ${this.ScoutReportTTL}).`, { "<creep>": creep, "<room>": creep.room });
          continue;
        }
      }

      this.log.info(`Journeying to ${targetRoomName} which is approx. ${dist} rooms away.`, { "<creep>": creep, "<room>": creep.room });
      return targetRoomName;
    }
    this.log.info(`No suitable destination found after ${this.MaxSearchAttempts} attempts.`, { "<creep>": creep, "<room>": creep.room });
    return null;
  }

  NewScoutingReport(creep: CreepExtra): ScoutingReport {
    const dist = Game.map.getRoomLinearDistance(creep.room.name, creep.AssignedRoom.name);
    const reportMsg = `${creep.room.name} (~${dist} Rooms from ${creep.memory.room})`;
    if (Memory.scoutingReports && creep.room.name in Memory.scoutingReports && "lastSeen" in Memory.scoutingReports[creep.room.name])
      this.log.info(`Updating Scouting Reporting for ${reportMsg}. Last Seen ${Game.time - Memory.scoutingReports[creep.room.name].lastSeen} Ticks Ago.`, { "<creep>": creep, "<room>": creep.room });
    else
      this.log.info(`Creating Scouting Reporting for ${reportMsg}`, { "<creep>": creep, "<room>": creep.room });

    return {
      ...MakeRoomReport(creep.room),
      scoutedFromOutpost: creep.memory.room,
      distFromOutpost: dist,
    };
  }

  OnSpawn(creep: CreepExtra): void { creep.notifyWhenAttacked(false); };

  TickCreep(creep: CreepExtra): void {
    if (creep.hits < creep.hitsMax)
      this.log.warn(`I'm being attacked in ${creep.room}, Health: %${((creep.hits / creep.hitsMax) * 100).toPrecision(4)} (${creep.hits}/${creep.hitsMax})!`);

    let newReport: ScoutingReport | undefined;

    // Create a new scouting report for old or newly visited rooms.
    Memory.scoutingReports ??= {};
    if (
      creep.MovedBetweenRooms
      || !(creep.room.name in Memory.scoutingReports)
      || Memory.scoutingReports[creep.room.name] === undefined
      || Memory.scoutingReports[creep.room.name].lastSeen === undefined
      || (Game.time - Memory.scoutingReports[creep.room.name].lastSeen ?? 0) > this.ScoutReportTTL
    )
      newReport = this.NewScoutingReport(creep);

    if (newReport !== undefined) {
      // If we made a new report, replace the one in memory.
      Memory.scoutingReports[creep.room.name] = newReport;

      // If the new report has hostiles, print a message.
      if (Game.time % 10 === 0 && newReport.hostiles !== undefined) {
        this.log.warn(`${creep.room} has hostiles: ${FormatHostileInfos(newReport.hostiles)}`);
      }
    }
  }

  GetInitialTask(): CreepTask<string> | null { return null }
  SelectNextTask(creep: CreepExtra): CreepTask<string> | null {
    const newRoom = this.FindNearbyRandomRoom(creep);
    if (newRoom) return new Move(new RoomPosition(25, 25, newRoom), 40);
    return null;
  }
}
