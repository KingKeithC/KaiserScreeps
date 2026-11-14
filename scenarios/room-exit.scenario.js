'use strict';

const assert = require('node:assert/strict');
const { createWorld, spec } = require('screeps-integration-tests');
const { assertNoErrors } = require('screeps-integration-tests/assertions');
const { MOVE } = require('screeps-integration-tests/constants');
const { MAIN: HOME, TOP: DESTINATION, twoRoomWorld } = require('./fixtures/two-room');
const CREEP_NAME = 'exit-test-creep';

function isExit(creep) {
  return creep.x === 0 || creep.x === 49 || creep.y === 0 || creep.y === 49;
}

async function run(opts = {}) {
  let previous = new Map();
  let observedExit = false;
  let crossedRoom = false;
  const world = await createWorld({
    ...twoRoomWorld(),
    ticks: 9,
    ...opts,
    onTick: async currentWorld => {
      const current = new Map();
      for (const room of [HOME, DESTINATION]) {
        for (const creep of await currentWorld.find({ room, type: 'creep', user: currentWorld.botId('bot') })) {
          const before = previous.get(creep.name);
          if (before && isExit(before)) {
            assert.ok(
              before.room !== creep.room || before.x !== creep.x || before.y !== creep.y,
              `${creep.name} remained on exit ${before.room}:${before.x}:${before.y}`,
            );
          }
          if (creep.name === CREEP_NAME) {
            observedExit ||= isExit(creep);
            crossedRoom ||= creep.room === DESTINATION;
          }
          current.set(creep.name, creep);
        }
      }
      previous = current;
    },
  });

  try {
    await world.tick(1);
    await world.spawnCreep(spec.creep(25, 2, { roomName: HOME, name: CREEP_NAME, body: [{ type: MOVE, hits: 100 }] }));
    await world.writeMemory('bot', {
      creeps: {
        [CREEP_NAME]: {
          role: 'Worker',
          room: HOME,
          currentTask: {
            action: '\ud83d\udc63',
            isCompleteFlag: false,
            targetPos: `${DESTINATION}:25:25`,
            minDistance: 5,
          },
        },
      },
    });
    await world.run();
    assertNoErrors(world.report);
    assert.ok(observedExit, 'the test creep must reach an exit');
    assert.ok(crossedRoom, 'the test creep must cross into the neighboring room');
    return world.report;
  } finally {
    await world.dispose();
  }
}

module.exports = { run };
