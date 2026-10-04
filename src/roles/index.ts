import { RoomRole } from "./Role";
import { Miner } from "./Miner";
import { WorkerI, WorkerII } from "./Worker";
import { Settler } from "./Settler";


RoomRole.Register(Miner);
RoomRole.Register(WorkerI);
RoomRole.Register(WorkerII);
// RoomRole.Register(Settler);
