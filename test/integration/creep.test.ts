import { assert } from 'chai';
import { helper, registerIntegrationHooks } from './helper';

const testCreepName = 'memory-test-creep';

describe('integration_creep', () => {
  registerIntegrationHooks();

  beforeEach(async () => {
    await helper.player.console(
      `Game.spawns.Spawn1.spawnCreep([MOVE], '${testCreepName}', { memory: { role: 'Worker', room: 'W0N1' } })`,
    );
  });

  it('should have a memory entry', async function () {
    await helper.server.tick();

    const memory = JSON.parse(await helper.player.memory) as Memory;
    const creepMemory = memory.creeps[testCreepName];

    assert.isObject(creepMemory);
    assert.isAbove(Object.keys(creepMemory ?? {}).length, 1);
  });
});
