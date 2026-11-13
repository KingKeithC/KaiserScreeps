import { assert } from 'chai';
import { helper, registerIntegrationHooks, WorldCreep } from './helper';

const testCreepName = 'memory-test-creep';
const creepPos = { x: 25, y: 25 };

describe('integration_creep', () => {
  registerIntegrationHooks();

  let memory: Memory;
  let creepMemory: CreepMemory;
  let creep: WorldCreep | undefined;

  beforeEach(async () => {
    // Add an owned creep to the room
    await helper.addSpawnedCreep(testCreepName, 'W0N1', [WORK, MOVE], creepPos.x, creepPos.y);
    // Tick the server to process the added objects
    await helper.server.tick();

    // Retrieve the player's memory and the specific creep's memory entry
    memory = JSON.parse(await helper.player.memory) as Memory;
    creepMemory = memory.creeps[testCreepName];
    creep = await helper.getCreep(testCreepName, 'W0N1');
  });

  it('should have a memory entry', function () {
    assert.isObject(creepMemory);
    assert.isAbove(Object.keys(creepMemory ?? {}).length, 1);
  });

  it('should have the correct role and room', function () {
    assert.equal(creepMemory?.role, 'Worker');
    assert.equal(creepMemory?.room, 'W0N1');
  });

  it('should move while working towards an energy source', async function () {
    if (!creep) throw new Error(`Creep ${testCreepName} was not found in W0N1`);
    const initialX = creep.x;
    const initialY = creep.y;
    await helper.server.tick();
    const movedCreep = await helper.getCreep(testCreepName, 'W0N1');
    if (!movedCreep) throw new Error(`Creep ${testCreepName} disappeared from W0N1`);
    assert.isTrue(movedCreep.x !== initialX || movedCreep.y !== initialY);
  });
});
