'use strict';

const assert = require('node:assert/strict');
const { createWorld, spec } = require('screeps-integration-tests');
const { assertNoErrors } = require('screeps-integration-tests/assertions');

const ROOM = 'W0N1';
const TICKS = 12;

async function run(opts = {}) {
  const observed = new Set();
  const world = await createWorld({
    rooms: [spec.baseRoom(ROOM)],
    bots: [{ username: 'bot', rooms: [ROOM] }],
    ticks: TICKS,
    ...opts,
  });

  try {
    for (let tick = 0; tick < TICKS; tick++) {
      const snapshot = world.evalInBot(
        `JSON.stringify(Object.values(Game.creeps).map(creep => ({
        name: creep.name,
        role: creep.memory.role,
        room: creep.memory.room,
        visible: !!Game.rooms[creep.memory.room],
        owned: !!Game.rooms[creep.memory.room]?.controller?.my
      })))`,
        'bot',
      );
      await world.tick(1);
      let hasData = false;
      for (const creep of await snapshot) {
        hasData = true;
        assert.ok(creep.role, `${creep.name} must have a role`);
        assert.ok(creep.room, `${creep.name} must have an assigned room`);
        assert.ok(creep.visible, `${creep.name}'s assigned room must be visible`);
        assert.ok(creep.owned, `${creep.name}'s assigned room must be owned`);
        observed.add(creep.name);
      }
    }
    await world.run();
    assertNoErrors(world.report);
    assert.ok(observed.size > 0, 'the bot must spawn at least one creep');
    return world.report;
  } finally {
    await world.dispose();
  }
}

module.exports = { run };
