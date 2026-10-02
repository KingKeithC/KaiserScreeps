import { COLOURS } from "utils/Colours";

export abstract class Role<MemoryShape extends Object> {
  abstract RoleName: string;
  abstract InitialJobMemory: MemoryShape;

  protected room: Room;

  constructor(room: Room) {
    this.room = room;
  }

  // How many creeps to have per room in this role
  abstract CountPerRoom: number;

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
      && c.memory.room == this.room.name
      && c.memory.role == this.RoleName
    );
  }

  TickRole(): void {
    this.TickStart();

    // Check to do spawns every `this.SpawnRate` ticks.
    if (Game.time - (this.room.memory.lastSpawnTick[this.RoleName] ?? 0) > this.SpawnRate) {
      this.DoSpawns();
      this.room.memory.lastSpawnTick[this.RoleName] = Game.time; // Reset
    }

    for (const creep of this.CreepsInRole()) {
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

  Adjectives = ["aglow", "ago", "ahead", "aided", "airy", "ajar", "akin", "alert", "alien", "batty", "bay", "beady", "beamy", "beat", "beefy", "beery", "cyan", "daft", "daily", "damn", "damp", "dandy", "dank", "dark", "dated", "dazed", "matte", "mauve", "mealy", "mean", "meaty", "meek", "pop", "port", "posed", "slav", "sleek", "slick", "slim", "waxed", "waxen"];
  Nouns = ["add", "adder", "adept", "advil", "beret", "berry", "bet", "beta", "bevel", "bevy", "bias", "cage", "cager", "cake", "dirt", "disc", "disco", "futon", "fuze", "fuzz", "gag", "gage", "gain", "game", "hydra", "hyena", "hymn", "hype", "ibis", "ice", "icing", "icon", "lunch", "lung", "lure", "lush", "lying", "mace", "macro", "madam", "mafia", "push", "put", "putt", "putty", "quack", "quad", "quake", "qualm", "quirk", "quirt", "quiz", "quota", "quote", "race", "racer", "rad", "runt", "ruse", "rush", "rust", "rut", "saber", "safe", "sag", "saga"]

  GetRandomSuffix() {
    const adj1 = this.Adjectives[Math.floor(Math.random() * this.Adjectives.length)];
    const adj2 = this.Adjectives[Math.floor(Math.random() * this.Adjectives.length)];
    const noun = this.Nouns[Math.floor(Math.random() * this.Nouns.length)];
    return [adj1, adj2, noun].join("-");
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

    // or quota met
    const current = this.CreepsInRole().length;
    if (current >= this.CountPerRoom) {
      console.log(`${this.room}[${this.RoleName}]: Quota Met ${current}/${this.CountPerRoom}`);
      return;
    }

    // or a spawn is already in progress
    if (this.room.find(FIND_MY_SPAWNS, { filter: (s) => s.spawning }).length) {
      console.log(`${this.room}[${this.RoleName}]: Need to spawn (${current}/${this.CountPerRoom}), but another spawn is in progress.`);
      return;
    }

    // or there isn't enough energy
    if (this.room.energyAvailable < this.RoleBodyCost()) {
      console.log(`${this.room}[${this.RoleName}]: Need to spawn (${current}/${this.CountPerRoom}), but lack the energy (costs ${this.RoleBodyCost()}, have ${this.room.energyAvailable}/${this.room.energyCapacityAvailable})...`);
      return;
    }

    // Find a suitable spawn point
    const spawns = this.room.find(FIND_MY_SPAWNS, { filter: (spawn) => !spawn.spawning });
    if (spawns.length === 0) {
      console.log(`${this.room}[${this.RoleName}]: Need to spawn (${current}/${this.CountPerRoom}), but no points are available or all are in use.`);
      return;
    }
    const spawnPoint = spawns[0];

    // Do the spawn
    const name = `${this.RoleName}-${this.GetRandomSuffix()}`;
    const result = spawnPoint.spawnCreep(
      this.BodyParts,
      name,
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
    if (result === OK)
      console.log(`${this.room}[${this.RoleName}]: ${current}/${this.CountPerRoom} +1 Spawning ${name} @ ${spawnPoint}...`);
    else
      console.log(`${this.room}[${this.RoleName}]: ${spawnPoint} Spawn failed with result: ${result}...`);
  }

  MoveLong(creep: Creep, dest: RoomPosition, minRange?: number): number {
    return creep.moveTo(dest, { visualizePathStyle: { stroke: COLOURS.PATH_LONG, lineStyle: "solid" }, range: minRange, reusePath: this.ReusePath, ignoreCreeps: true });
  }

  MoveAvoidCreeps(creep: Creep, dest: RoomPosition, minRange?: number): number {
    return creep.moveTo(dest, { visualizePathStyle: { stroke: COLOURS.PATH_STUCK, lineStyle: "dotted" }, range: minRange, reusePath: 0, ignoreCreeps: false });
  }

  // Returns 1 when in range; otherwise returns the moveTo result.
  MoveCreep(creep: Creep, target: RoomPosition, withinRange: number): number {
    // Start in long mode
    if (!creep.memory.moveMode) creep.memory.moveMode = "long";

    // Figure out if we moved, and then update position
    const justMoved = !creep.memory.lastPos
      || creep.pos.x !== creep.memory.lastPos.x
      || creep.pos.y !== creep.memory.lastPos.y;
    creep.memory.lastPos = { x: creep.pos.x, y: creep.pos.y };

    // Update stuck tracking
    if (justMoved) {
      creep.memory.stuckTicks = 0; // We must not be stuck
      creep.memory.successfulAvoidMoves = (creep.memory.successfulAvoidMoves ?? 0) + 1; // Increment avoidance move counter
    } else if (creep.fatigue === 0) {
      creep.memory.stuckTicks = (creep.memory.stuckTicks ?? 0) + 1; // Increment stuck counter
      creep.memory.successfulAvoidMoves = 0; // Reset
    }

    // Arrived
    if (creep.pos.getRangeTo(target) <= withinRange) {
      // Reset to clean, long move mode
      creep.memory.stuckTicks = 0;
      creep.memory.successfulAvoidMoves = 0;
      creep.memory.moveMode = "long";
      return 1;
    }

    // Switch mode if needed
    if (creep.memory.moveMode == "avoidCreeps" && (creep.memory.successfulAvoidMoves ?? 0) > this.MaxAvoidTicks)
      creep.memory.moveMode = "long";
    else if (creep.memory.moveMode == "long" && (creep.memory.stuckTicks ?? 0) > this.MaxStuckTicks)
      creep.memory.moveMode = "avoidCreeps";

    // Invoke the actual move
    const moveResult = creep.memory.moveMode === "long"
      ? this.MoveLong(creep, target, withinRange)
      : this.MoveAvoidCreeps(creep, target, withinRange);
    return moveResult;
  }
}
