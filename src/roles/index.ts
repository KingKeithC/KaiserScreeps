import { RoomRole } from "./Role";
import { Miner, MinerII } from "./Miner";
import { WorkerI, WorkerII, WorkerIII } from "./Worker";
import { Settler } from "./Settler";


RoomRole.Register(Miner);
RoomRole.Register(MinerII);
RoomRole.Register(WorkerI);
RoomRole.Register(WorkerII);
RoomRole.Register(WorkerIII);
RoomRole.Register(Settler);
