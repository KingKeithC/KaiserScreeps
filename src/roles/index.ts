import { RoomRole } from "./Role";
import { Miner, MinerII } from "./Miner";
import { WorkerI, WorkerII, WorkerIII } from "./Worker";
import { Settler } from "./Settler";
import { Scout } from "./Scout";
import { Warrior } from "./Warrior";


RoomRole.Register(Miner);
RoomRole.Register(MinerII);
RoomRole.Register(WorkerI);
RoomRole.Register(WorkerII);
RoomRole.Register(WorkerIII);
RoomRole.Register(Settler);
RoomRole.Register(Scout);
RoomRole.Register(Warrior);
