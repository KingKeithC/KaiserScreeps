interface UnitTestGame {
  creeps: Record<string, unknown>;
  rooms: Record<string, unknown>;
  spawns: Record<string, unknown>;
  time: number;
  cpu: { bucket: number };
}

export const Game: UnitTestGame = { creeps: {}, rooms: {}, spawns: {}, time: 12345, cpu: { bucket: 0 } };

export const Memory: Memory = {
  creeps: {},
  rooms: {},
  flags: {},
  powerCreeps: {},
  spawns: {},
  terminals: {},
  profiler: {},
};
