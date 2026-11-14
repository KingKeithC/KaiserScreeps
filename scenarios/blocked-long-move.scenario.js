'use strict';

const assert = require('node:assert/strict');
const { createWorld, spec } = require('screeps-integration-tests');
const { assertNoErrors } = require('screeps-integration-tests/assertions');
const { MOVE, WORK, INVADER_USER_ID } = require('screeps-integration-tests/constants');

const HOME = 'W0N1';
const CREEP_NAME = 'blocked-move-creep';
const BLOCKER_NAME = 'stationary-blocker';
const START = { x: 20, y: 20 };

async function run(opts = {}) {
  const world = await createWorld({
    rooms: [
      {
        ...spec.baseRoom(HOME),
        terrain: {
          walls: [
            { x: 19, y: 19 },
            { x: 20, y: 19 },
            { x: 21, y: 19 },
            { x: 19, y: 20 },
            { x: 19, y: 21 },
            { x: 20, y: 21 },
            { x: 21, y: 21 },
          ],
        },
      },
      { name: 'W0N2' },
    ],
    bots: [{ username: 'bot', rooms: [HOME] }],
    ticks: 3,
    ...opts,
  });

  try {
    await world.tick(1);
    await world.spawnCreep(
      spec.creep(START.x, START.y, { roomName: HOME, name: CREEP_NAME, body: [{ type: MOVE, hits: 100 }] }),
    );
    await world.spawnCreep(
      spec.creep(21, 20, {
        roomName: HOME,
        name: BLOCKER_NAME,
        userId: INVADER_USER_ID,
        body: [{ type: WORK, hits: 100 }],
      }),
    );
    await world.writeMemory('bot', {
      creeps: {
        [CREEP_NAME]: {
          role: 'Worker',
          room: HOME,
          moveMode: 'long',
          stuckTicks: 0,
          currentTask: { action: '\ud83d\udc63', isCompleteFlag: false, targetPos: `${HOME}:25:20`, minDistance: 0 },
        },
      },
    });

    await world.tick(1);
    const before = (await world.readMemory('bot')).creeps[CREEP_NAME];
    const blockedCreep = await world.findOne({ room: HOME, type: 'creep', name: CREEP_NAME });
    const blocker = await world.findOne({ room: HOME, type: 'creep', name: BLOCKER_NAME });
    assert.equal(before.moveMode, 'long');
    assert.equal(before.intendedToMove, true, 'the bot must register a move intent');
    assert.ok(Number.isInteger(before.stuckTicks), 'the stuck counter must be initialized');
    assert.deepEqual({ x: blockedCreep.x, y: blockedCreep.y }, START, 'the first move must be blocked');
    assert.deepEqual({ x: blocker.x, y: blocker.y }, { x: 21, y: 20 });

    await world.tick(1);
    const after = (await world.readMemory('bot')).creeps[CREEP_NAME];
    const stillBlocked = await world.findOne({ room: HOME, type: 'creep', name: CREEP_NAME });
    assert.deepEqual({ x: stillBlocked.x, y: stillBlocked.y }, START);
    assert.equal(after.moveMode, 'long');
    assert.equal(after.stuckTicks, Number(before.stuckTicks) + 1, 'a blocked long move must increment stuckTicks once');
    assertNoErrors(world.report);
    return world.report;
  } finally {
    await world.dispose();
  }
}

module.exports = { run };
