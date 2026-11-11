import { assert } from 'chai';
import { Ledger, StoreId } from '../../src/logistics/Ledger';

describe('unit_ledger', () => {
  const room = 'W0N0';
  const otherRoom = 'W1N0';
  const actor = 'actor' as StoreId;
  const otherActor = 'otherActor' as StoreId;
  const source = 'source' as StoreId;
  const destination = 'destination' as StoreId;
  const otherStore = 'otherStore' as StoreId;
  let ledger: Ledger;
  let originalTime: number;

  beforeEach(() => {
    originalTime = Game.time;
    ledger = new Ledger();
  });

  afterEach(() => {
    Object.assign(Game, { time: originalTime });
  });

  it('returns zero and false for unknown stores and actors', () => {
    assert.equal(ledger.Outflow(room, source), 0);
    assert.equal(ledger.Inflow(room, destination, RESOURCE_ENERGY), 0);
    assert.isFalse(ledger.HasActed(room, actor));
  });

  it('accumulates inflow and outflow by store and resource', () => {
    ledger.RecordIntent(room, actor, source, destination, RESOURCE_ENERGY, 10);
    ledger.RecordIntent(room, otherActor, source, destination, RESOURCE_ENERGY, 5);
    ledger.RecordIntent(room, actor, source, destination, RESOURCE_POWER, 7);
    ledger.RecordIntent(room, actor, otherStore, destination, RESOURCE_ENERGY, 3);

    assert.equal(ledger.Outflow(room, source, RESOURCE_ENERGY), 15);
    assert.equal(ledger.Outflow(room, source, RESOURCE_POWER), 7);
    assert.equal(ledger.Outflow(room, source), 22);
    assert.equal(ledger.Outflow(room, otherStore), 3);
    assert.equal(ledger.Inflow(room, destination, RESOURCE_ENERGY), 18);
    assert.equal(ledger.Inflow(room, destination, RESOURCE_POWER), 7);
    assert.equal(ledger.Inflow(room, destination), 25);
    assert.equal(ledger.Inflow(room, source), 0);
    assert.equal(ledger.Outflow(room, source, RESOURCE_HYDROGEN), 0);
    assert.equal(ledger.Inflow(room, destination, RESOURCE_HYDROGEN), 0);
  });

  it('tracks actors and amounts independently by room', () => {
    ledger.RecordIntent(room, actor, source, destination, RESOURCE_ENERGY, 10);
    ledger.RecordIntent(otherRoom, otherActor, source, destination, RESOURCE_ENERGY, 4);

    assert.equal(ledger.Outflow(room, source), 10);
    assert.equal(ledger.Inflow(room, destination), 10);
    assert.equal(ledger.Outflow(otherRoom, source), 4);
    assert.equal(ledger.Inflow(otherRoom, destination), 4);
    assert.isTrue(ledger.HasActed(room, actor));
    assert.isFalse(ledger.HasActed(otherRoom, actor));
    assert.isFalse(ledger.HasActed(room, otherActor));
    assert.isTrue(ledger.HasActed(otherRoom, otherActor));
  });

  it('clears all rooms and actors when the tick changes', () => {
    ledger.RecordIntent(room, actor, source, destination, RESOURCE_ENERGY, 10);
    ledger.RecordIntent(otherRoom, otherActor, source, destination, RESOURCE_POWER, 4);
    Object.assign(Game, { time: originalTime + 1 });

    assert.equal(ledger.Outflow(room, source), 0);
    assert.equal(ledger.Inflow(room, destination), 0);
    assert.isFalse(ledger.HasActed(room, actor));
    assert.equal(ledger.Outflow(otherRoom, source), 0);
    assert.equal(ledger.Inflow(otherRoom, destination), 0);
    assert.isFalse(ledger.HasActed(otherRoom, otherActor));
  });

  it('clears old intents when recording the first intent of a new tick', () => {
    ledger.RecordIntent(room, actor, source, destination, RESOURCE_ENERGY, 10);
    Object.assign(Game, { time: originalTime + 1 });
    ledger.RecordIntent(room, otherActor, source, destination, RESOURCE_ENERGY, 3);

    assert.equal(ledger.Outflow(room, source), 3);
    assert.equal(ledger.Inflow(room, destination), 3);
    assert.isFalse(ledger.HasActed(room, actor));
    assert.isTrue(ledger.HasActed(room, otherActor));
  });
});
