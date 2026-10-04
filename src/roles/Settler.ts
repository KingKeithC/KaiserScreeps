import { CreepExtra } from "Creep";
import { RoomRole } from "./Role";

class SettlerMemory extends Object {
  readonly claimedRoomDirection?: DirectionConstant;
  readonly push: boolean;
  readonly reserve: boolean;

  constructor(direction?: DirectionConstant, push: boolean = false, reserve: boolean = false) {
    super();
    this.claimedRoomDirection = direction;
    this.push = push;
    this.reserve = reserve;
  }
}

export class Settler extends RoomRole<SettlerMemory> {
  static readonly RoleName: string = "Settler";
  BodyParts = [MOVE, MOVE, WORK, CLAIM];

  InitialJobMemory = new SettlerMemory();

  CountPerRoom = 1;
  GlobalCount = 2;

  HomeIdleRange = 30;


  FindSpawns(): StructureSpawn[] {
    // Any spawn in any of our rooms
    return Object.values(Game.rooms).map(r => r.find(FIND_MY_SPAWNS)).reduce((acc, elem) => acc.concat(elem), [])
  }

  ClaimedRoom(mem: SettlerMemory): Room | undefined {
    if (!mem.claimedRoomDirection) return;
    return Game.rooms[mem.claimedRoomDirection];
  }

  ReturnHome(settler: CreepExtra): void {
    settler.MoveCreep(this.manager.controller!, { range: this.HomeIdleRange });
  }

  TickCreep(creep: CreepExtra, memory: SettlerMemory): void {
    const claim = this.ClaimedRoom(memory);
    if (!memory.claimedRoomDirection || !claim || !claim.controller) {
      this.ReturnHome(creep);
      return;
    } else if (claim.controller.owner != undefined && claim.controller.owner !== this.manager.controller?.owner) {
      console.log(`[${this.manager.name}] -> ${claim}${creep} Claimed room is no longer neutral or ours ${claim.controller.owner}!`)
      this.ReturnHome(creep);
      return;
    }

    const hostiles = claim.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length > 0) {
      const msg = `[${this.manager.name}] -> ${claim}${creep} !!! Claimed room has ${hostiles.length} hostiles!`;

      if (!memory.push) {
        console.log(msg + " Not set to push, disengaging.");
        this.ReturnHome(creep);
        return;
      }
      console.log(msg + " For the Homeland!...");
    }

    if (creep.MoveCreep(claim.controller.pos, { range: 1 }) != 1)
      return;

    // Claim it
    if (memory.reserve)
      creep.reserveController(claim.controller);
    else
      creep.claimController(claim.controller);
  }
}

RoomRole.Register(Settler);
