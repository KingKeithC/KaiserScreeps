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
    // runs before each test in this block
    // @ts-ignore : allow adding Game to global
    global.Game = _.clone(Game);
    // @ts-ignore : allow adding Memory to global
    global.Memory = _.clone(Memory);
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

    Game.creeps.persistValue = 'any value';

    new RoomExtra({ name: 'W0N0' } as Room, new Colony()).CleanupDeadCreeps();

    assert.isDefined(Memory.creeps.persistValue);
    assert.isUndefined(Memory.creeps.notPersistValue);
  });
});
