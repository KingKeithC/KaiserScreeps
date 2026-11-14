'use strict';

const assert = require('node:assert/strict');
const { createWorld } = require('screeps-integration-tests');
const { assertBotWorked } = require('screeps-integration-tests/assertions');
const { MAIN, SPAWN, twoRoomWorld } = require('./fixtures/two-room');

const MAX_TICKS = 5;

async function run(opts = {}) {
  const world = await createWorld({ ...twoRoomWorld(), ...opts, ticks: MAX_TICKS, logLevel: 'all' });
  const logMessages = [];
  const errorMessages = [];

  try {
    const bot = world.bots.bot;

    // Capture output streams
    await bot._adapter.pubsub.subscribe(`user:${bot.id}/console`, event => {
      const { messages, error } = JSON.parse(event);
      logMessages.push(...(messages?.log || []));
      if (error) errorMessages.push(error);
    });

    await world.run(1);

    // Assert state after initial tick
    assertBotWorked(world.report);

    const walls = await world.rooms[MAIN].canonical.terrain.walls;
    assert.ok(typeof walls === 'object', 'the room should have wall terrain');
    assert.ok(walls.length === 30, 'the fixture spawn room should init with 30 terrain walls');

    const spawn = await world.findOne({ room: MAIN, type: 'spawn', x: SPAWN.x, y: SPAWN.y });
    assert.ok(spawn?.spawning?.name, 'the spawn must have started spawning a creep');

    const memory = await world.readMemory('bot');
    assert.equal(memory.creeps[spawn.spawning.name]?.role, 'Worker', 'the spawned creep must be a worker');

    const resetMsg = logMessages.filter(message => /Global state reset./.test(message));
    assert.ok(resetMsg.length === 1, 'bot log channel should have printed reset message');

    // Assert state after the MAX_TICKS'th tick
    await world.run();
    assertBotWorked(world.report);
    assert.equal(world.report.ticksRun, 5, 'the bot must run for all five ticks');
    assert.deepEqual(errorMessages, [], `bot error channel should be empty: ${errorMessages.join('\n')}`);

    return world.report;
  } finally {
    await world.dispose();
  }
}

module.exports = { run };
