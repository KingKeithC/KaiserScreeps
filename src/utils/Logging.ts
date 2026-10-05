import { CreepExtra } from "Creep";
import { RoomRole } from "roles/Role";
import { RoomExtra } from "Room";

declare global {

  type LogDetails = {
    creep?: CreepExtra,
    room?: RoomExtra,
    role?: RoomRole<any>,
  }


  interface Memory {
    logLevel: LogLevel;
  }
}

export enum LogLevel {
  Debug,
  Info,
}

export function LogMsg(level: LogLevel = LogLevel.Info, msg: string, details?: LogDetails): void {
  if (level >= (Memory.logLevel ?? LogLevel.Info))
    LogDetails(msg, details ?? {});
}

function LogDetails(msg: string, details: LogDetails): void {
  var preamble: string = "";

  // First, the room name
  if (details.room)
    preamble += `[C:${details.room.name}]`;
  else if (details.role)
    preamble += `[C:${details.role.manager.name}]`;
  else if (details.creep && details.creep.memory.room)
    preamble += `[M:${details.creep.memory.room}]`;

  // Then, the role name
  if (details.role)
    preamble += `[C:${details.role.RoleName}]`;
  else if (details.creep && details.creep.memory.role)
    preamble += `[C:${details.creep.memory.role}]`;

  // Then the creep name
  if (details.creep)
    preamble += `[C:${details.creep.name}]`;

  console.log(preamble + msg);
}
