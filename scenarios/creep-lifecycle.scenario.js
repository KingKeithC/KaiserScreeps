'use strict';

const assert = require('node:assert/strict');
const { createWorld, spec } = require('screeps-integration-tests');
const { assertNoErrors } = require('screeps-integration-tests/assertions');
const { WORK, MOVE } = require('screeps-integration-tests/constants');

const ROOM = 'W0N1';
const CREEP_NAME = 'memory-test-creep';
const START = { x: 20, y: 20 };

async function run(opts = {}) {
  const world = await createWorld({
    rooms: [spec.baseRoom(ROOM)],
    bots: [{ username: 'bot', rooms: [ROOM] }],
    memoryOverrides: {
      creeps: { [CREEP_NAME]: { role: 'Worker', room: ROOM }, staleCreep: { role: 'Worker', room: ROOM } },
    },
    ticks: 4,
    ...opts,
  });

  try {
    await world.spawnCreep(spec.creep(START.x, START.y, { roomName: ROOM, name: CREEP_NAME, body: [WORK, MOVE] }));
    await world.run();

    assertNoErrors(world.report);
    const memory = await world.readMemory('bot');
    assert.equal(memory.creeps[CREEP_NAME].role, 'Worker');
    assert.equal(memory.creeps[CREEP_NAME].room, ROOM);
    assert.equal(memory.creeps.staleCreep, undefined);

    const creep = await world.findOne({ room: ROOM, type: 'creep', name: CREEP_NAME });
    assert.ok(creep);

    return world.report;
  } finally {
    await world.dispose();
  }
}

module.exports = { run };
