import { Nouns, Adjectives, Colours } from "data";

export abstract class RoomRole<MemoryShape extends Object> {
  abstract RoleName: string;
  abstract InitialJobMemory: MemoryShape;

  protected room: Room;

  constructor(room: Room) {
    this.room = room;
  }

  // How many creeps to have per room in this role
  abstract CountPerRoom: number;
  GlobalCount: number = -1; // -1 for unlimited

  // Body for creeps spawned of this role
  abstract BodyParts: BodyPartConstant[];

  // RCL Ranges to constrain role spawns
  StartSpawnAtRCL: number = 1;
  StopSpawnAtRCL: number = 100;

  // How ofter to check for spawn
  SpawnRate: number = 120;


  ReusePath: number = 10;
  MaxStuckTicks: number = 2;
  MaxAvoidTicks: number = 3;

  TickStart(): void { }
  abstract TickCreep(creep: Creep, task: MemoryShape): void;
  TickEnd(): void { }

  protected RoleBodyCost(): number {
    var total: number = 0;
    for (const part of this.BodyParts) total += BODYPART_COST[part];
    return total;
  }

  protected CreepsInRole() {
    return Object.values(Game.creeps).filter(c =>
      !c.spawning
      && c.memory.role == this.RoleName
    );
  }

  protected CreepsInRoomAndRole() {
    return Object.values(this.CreepsInRole()).filter(c => c.memory.room == this.room.name);
  }

  TickRole(): void {
    this.TickStart();

    // Check to do spawns every `this.SpawnRate` ticks.
    if (Game.time - (this.room.memory.lastSpawnTick[this.RoleName] ?? 0) > this.SpawnRate) {
      this.DoSpawns();
      this.room.memory.lastSpawnTick[this.RoleName] = Game.time; // Reset
    }

    for (const creep of this.CreepsInRoomAndRole()) {
      var task = creep.memory.jobMemory as MemoryShape;
      if (task == null || task == undefined) {
        console.log(`${this.room}${creep} TickRole: Creep has invalid memory. Wiping...`);
        task = this.InitialJobMemory;
        creep.memory.jobMemory = task;
      }

      this.TickCreep(creep, task);

      const ttl = creep.ticksToLive ?? 100;
      if (ttl === 1)
        creep.say("☠️");
      else if (ttl === 2)
        creep.say("🤡");
      else if (ttl === 3)
        creep.say("🫲☹️🫱💔🫂");
      else if (ttl === 4)
        creep.say("😭🙏");
      else if (ttl === 5)
        creep.say("😰");
      else if (ttl === 10)
        creep.say("😨");
    }
    this.TickEnd();
  }

  GetRandomSuffix() {
    const adj1 = Adjectives[Math.floor(Math.random() * Adjectives.length)];
    const adj2 = Adjectives[Math.floor(Math.random() * Adjectives.length)];
    const noun = Nouns[Math.floor(Math.random() * Nouns.length)];
    return [adj1, adj2, noun].join("-");
  }

  FindSpawns(): StructureSpawn[] {
    return this.room.find(FIND_MY_SPAWNS, { filter: (spawn) => !spawn.spawning });
  }

  DoSpawns(): void {
    // Delete memory of missing creeps before doing spawns
    for (const name in Memory.creeps) {
      if (!(name in Game.creeps)) {
        console.log(`Cleanup memory for ${name}`);
        delete Memory.creeps[name];
      }
    }

    // Cannot spawn if RCL is wrong
    const rcl = this.room.controller?.level ?? 0;
    if (rcl < this.StartSpawnAtRCL || rcl >= this.StopSpawnAtRCL) {
      console.log(`${this.room}[${this.RoleName}]: RCL (${rcl}) is outside spawn requirements (${this.StartSpawnAtRCL} <= RCL < ${this.StopSpawnAtRCL}`);
      return;
    };

    // or global quota met if there is one
    if (this.GlobalCount >= 0) {
      const globalCount = this.CreepsInRole().length;
      if (globalCount >= this.GlobalCount) {
        console.log(`[${this.RoleName}]: Global Quota Met ${globalCount}/${this.GlobalCount}`);
        return;
      }
    }

    // or room quota met
    const roomCount = this.CreepsInRoomAndRole().length;
    if (roomCount >= this.CountPerRoom) {
      console.log(`${this.room}[${this.RoleName}]: Room Quota Met ${roomCount}/${this.CountPerRoom}`);
      return;
    }

    // or a spawn is already in progress
    if (this.room.find(FIND_MY_SPAWNS, { filter: (s) => s.spawning }).length) {
      console.log(`${this.room}[${this.RoleName}]: Need to spawn (${roomCount}/${this.CountPerRoom}), but another spawn is in progress.`);
      return;
    }

    // or there isn't enough energy
    if (this.room.energyAvailable < this.RoleBodyCost()) {
      console.log(`${this.room}[${this.RoleName}]: Need to spawn (${roomCount}/${this.CountPerRoom}), but lack the energy (costs ${this.RoleBodyCost()}, have ${this.room.energyAvailable}/${this.room.energyCapacityAvailable})...`);
      return;
    }

    // Find a suitable spawn point
    const possibleSpawns = this.FindSpawns();
    if (possibleSpawns.length === 0) {
      console.log(`${this.room}[${this.RoleName}]: Need to spawn (${this.CreepsInRoomAndRole().length}/${this.CountPerRoom}), but no points could be found.`);
      return;
    }

    const newName = `${this.RoleName}-${this.GetRandomSuffix()}`;
    for (const spawnPoint of possibleSpawns) {
      // Try to do the spawn
      const result = spawnPoint.spawnCreep(
        this.BodyParts,
        newName,
        {
          memory: {
            room: this.room.name,
            role: this.RoleName,
            stuckTicks: 0,
            lastPos: { x: spawnPoint.pos.x, y: spawnPoint.pos.y },
            jobMemory: this.InitialJobMemory,
          },
        }
      );

      // Log the result

      if (result === OK) {
        console.log(`${this.room}[creep ${newName}]: (${roomCount}+1/${this.CountPerRoom}) Spawning @ ${spawnPoint.name}...`);
        return; // Successful, no need to proceed.
      }
      console.log(`${this.room}[creep ${newName}]: (${roomCount}/${this.CountPerRoom}) Unable to spawn at ${spawnPoint} due to: ${result}...`);
    }
    console.log(`${this.room}[creep ${newName}]: All spawn attempts failed... woe is me for I did not experience life :(`);
  }

  MoveLong(creep: Creep, dest: RoomPosition | { pos: RoomPosition; }, minRange?: number): number {
    return creep.moveTo(dest, {
      visualizePathStyle: { stroke: Colours.PATH_LONG, lineStyle: "solid" },
      range: minRange,
      reusePath: this.ReusePath,
      ignoreCreeps: true
    });
  }

  MoveAvoidCreeps(creep: Creep, dest: RoomPosition | { pos: RoomPosition; }, minRange?: number): number {
    return creep.moveTo(dest, {
      visualizePathStyle: { stroke: Colours.PATH_STUCK, lineStyle: "dotted" },
      range: minRange,
      reusePath: this.MaxAvoidTicks,
      ignoreCreeps: false,
      ignoreRoads: true,
      maxOps: 200,
    });
  }

  // Returns 1 when in range; otherwise returns the moveTo result.
  MoveCreep(creep: Creep, target: RoomPosition | { pos: RoomPosition; }, withinRange: number): number {
    // Init movement trackers
    creep.memory.moveMode ??= "long";
    creep.memory.stuckTicks ??= 0;
    creep.memory.successfulAvoidMoves ??= 0;

    // Figure out if we moved, and then update position
    const movedBetweenTicks = !creep.memory.lastPos
      || creep.pos.x !== creep.memory.lastPos.x
      || creep.pos.y !== creep.memory.lastPos.y;
    creep.memory.lastPos = { x: creep.pos.x, y: creep.pos.y };

    // Arrived / Base case
    if (creep.pos.getRangeTo(target) <= withinRange) {
      // Reset to clean, long move mode
      creep.memory.stuckTicks = 0;
      creep.memory.successfulAvoidMoves = 0;
      creep.memory.moveMode = "long";
      return 1;
    }

    // Increment counters
    if (creep.memory.moveMode === "avoidCreeps" && movedBetweenTicks) {
      creep.memory.successfulAvoidMoves++;
    } else if (creep.memory.moveMode === "long" && !movedBetweenTicks && creep.fatigue === 0) {
      creep.memory.stuckTicks++;
    } else if (creep.memory.moveMode === "long" && movedBetweenTicks) {
      creep.memory.stuckTicks = 0;
    }

    // Switch move mode
    if (creep.memory.moveMode === "long" && creep.memory.stuckTicks > this.MaxStuckTicks) {
      creep.memory.moveMode = "avoidCreeps";
      creep.memory.stuckTicks = 0;
      creep.memory.successfulAvoidMoves = 0;
    } else if (creep.memory.moveMode === "avoidCreeps" && creep.memory.successfulAvoidMoves > this.MaxAvoidTicks) {
      creep.memory.moveMode = "long";
      creep.memory.stuckTicks = 0;
      creep.memory.successfulAvoidMoves = 0;
    }

    // Invoke the actual move
    return creep.memory.moveMode === "long"
      ? this.MoveLong(creep, target, withinRange)
      : this.MoveAvoidCreeps(creep, target, withinRange);
  }
}
