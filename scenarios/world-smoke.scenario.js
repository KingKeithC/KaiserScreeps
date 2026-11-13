'use strict';

const assert = require('node:assert/strict');
const { createWorld, spec } = require('screeps-integration-tests');
const { assertBotWorked, assertNoErrors } = require('screeps-integration-tests/assertions');

const ROOM = 'W0N1';

async function run(opts = {}) {
  const world = await createWorld({
    rooms: [spec.baseRoom(ROOM)],
    bots: [{ username: 'bot', rooms: [ROOM] }],
    ticks: 10,
    ...opts,
  });

  try {
    await world.writeMemory('bot', { frameworkSmoke: { started: true } });
    await world.run();

    assertBotWorked(world.report);
    assertNoErrors(world.report);
    assert.equal(world.report.ticksRun, 10);
    assert.equal(await world.getRcl(ROOM), 1);
    assert.equal((await world.find({ room: ROOM, type: 'source' })).length, 2);
    assert.equal((await world.readMemory('bot')).frameworkSmoke.started, true);

    return world.report;
  } finally {
    await world.dispose();
  }
}

module.exports = { run };
