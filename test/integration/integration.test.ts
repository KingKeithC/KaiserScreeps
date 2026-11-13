import { assert } from 'chai';
import { helper, registerIntegrationHooks } from './helper';

describe('integration_main', () => {
  registerIntegrationHooks();

  it('runs a server and matches the game tick', async function () {
    for (let i = 1; i < 10; i += 1) {
      assert.equal(await helper.server.world.gameTime, i);
      await helper.server.tick();
    }
  });

  it('captures room snapshots before and after a tick', async function () {
    const before = await helper.snapshotRoom('W0N1', 'Before tick');
    await helper.server.tick();
    const after = await helper.snapshotRoom('W0N1', 'After tick');

    assert.equal(before.roomName, 'W0N1');
    assert.equal(after.gameTime, before.gameTime + 1);
    assert.equal(before.terrain.length, 2500);
    assert.isAbove(before.objects.length, 0);
  });

  it('writes and reads to memory', async function () {
    await helper.player.console(`Memory.foo = 'bar'`);
    await helper.server.tick();
    const memory = JSON.parse(await helper.player.memory);
    assert.equal(memory.foo, 'bar');
  });
});
