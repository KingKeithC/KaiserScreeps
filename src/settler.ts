import { Role } from "role";

class SettlerMemory extends Object {
  readonly targetRoom: string;
  readonly push: boolean;
  readonly reserve: boolean;

  constructor(name: string, push: boolean = false, reserve: boolean = false) {
    super();
    this.targetRoom = name;
    this.push = push;
    this.reserve = reserve;
  }
}

export class Settler extends Role<SettlerMemory> {
  RoleName = "Settler";

  get InitialJobMemory() {

    const settlersByRoom = this.CreepsInRole().reduce((counts, settler) => {
      const roomName = (settler.memory.jobMemory as SettlerMemory)?.targetRoom;
      if (roomName != null)
        counts.set(roomName, (counts.get(roomName) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());

    const leastAssignedRoom = Object.values(Game.rooms)
      .map(r => ({ room: r, count: settlersByRoom.get(r.name) ?? 0 }))
      .sort((a, b) => a.count - b.count)[0]?.room;

    return new SettlerMemory(leastAssignedRoom.name);
  }

  get CountPerRoom() {
    // 1 settler per unique claimed room
    var claimedRooms: string[] = [];

    for (const flagClaims of Object.values(Game.flags).filter(f => f.name.startsWith("Claim"))) {
      if (!claimedRooms.includes(flagClaims.name)) claimedRooms.push(flagClaims.name);
    }

    return claimedRooms.length;
  }

  GetClaimedRoom(_: Creep, mem: SettlerMemory) { return Game.rooms[mem.targetRoom]; }

  BodyParts = [MOVE, MOVE, MOVE, MOVE, CLAIM, CLAIM];

  TickCreep(creep: Creep, memory: SettlerMemory): void {
    const claimed = this.GetClaimedRoom(creep, memory);

    if (claimed.controller == undefined || claimed.controller == null) {
      console.log(`${this.room}${creep} Claimed room has no controller!`);
      return; // Nothing more to do.
    }

    const hostiles = claimed.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length > 0) {
      const msg = `${this.room}${creep} !!! Claimed room has ${hostiles.length} hostiles! `;

      if (!memory.push) {
        console.log(msg + "Not set to push, disengaging.");
        this.ReturnHome(creep);
        return;
      }

      console.log(msg + "Pushing...");
    }

    // Move in range of the room's controller
    if (this.MoveCreep(creep, claimed.controller.pos, 1) != 1) return;

    // Claim it
    if (memory.reserve)
      creep.reserveController(claimed.controller);
    else
      creep.claimController(claimed.controller);
  }

  ReturnHome(settler: Creep): void {
    const homeController = Game.rooms[settler.memory.room].controller;
    if (homeController?.pos) this.MoveCreep(settler, homeController?.pos, 20);
  }
}
