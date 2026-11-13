/* eslint-disable @typescript-eslint/ban-ts-comment */
import { assert } from 'chai';
import { loop } from '../../src/Main';
import { Colony } from '../../src/Colony';
import { RoomExtra } from '../../src/Room';
import { Game, Memory } from './mock';

describe('unit_main', () => {
  before(() => {
    // runs before all test in this block
  });

  beforeEach(() => {
    Object.assign(global, { Game: _.clone(Game), Memory: _.clone(Memory) });
  });

  it('should export a loop function', () => {
    assert.isTrue(typeof loop === 'function');
  });

  it('should return void when called with no context', () => {
    assert.isUndefined(loop());
  });

  it('Automatically delete memory of missing creeps', () => {
    Memory.creeps.persistValue = { room: 'W0N0' };
    Memory.creeps.notPersistValue = { room: 'W0N0' };

    Game.creeps.persistValue = { name: 'persistValue' };

    new RoomExtra(new Room('W0N0'), new Colony()).CleanupDeadCreeps();

    assert.isDefined(Memory.creeps.persistValue);
    assert.isUndefined(Memory.creeps.notPersistValue);
  });
});
