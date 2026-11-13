import { assert } from 'chai';
import { CaptureRoomSnapshot, RenderRoomSnapshot } from '../integration/roomSnapshot';

describe('unit_roomSnapshot', () => {
  const createWorld = (objects: unknown[]) => ({
    gameTime: 123,
    getTerrain: () =>
      Promise.resolve({
        get: (x: number, y: number) => {
          if (x === 0 && y === 0) return 'wall';
          if (x === 1 && y === 0) return 'swamp';
          return 'plain';
        },
      }),
    roomObjects: () => Promise.resolve(objects),
  });

  it('captures terrain and JSON-safe objects without transient IDs by default', async () => {
    const snapshot = await CaptureRoomSnapshot(
      createWorld([{ _id: 'database-id', room: 'W0N1', x: 4, y: 7, type: 'creep', name: 'Worker' }]),
      'W0N1',
    );

    assert.equal(snapshot.roomName, 'W0N1');
    assert.equal(snapshot.gameTime, 123);
    assert.lengthOf(snapshot.terrain, 2500);
    assert.equal(snapshot.terrain.slice(0, 3), '120');
    assert.deepEqual(snapshot.objects, [{ name: 'Worker', room: 'W0N1', type: 'creep', x: 4, y: 7 }]);
    assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  });

  it('can include object IDs when identity matters to a comparison', async () => {
    const snapshot = await CaptureRoomSnapshot(
      createWorld([{ _id: 'database-id', x: 4, y: 7, type: 'creep' }]),
      'W0N1',
      { includeObjectIds: true },
    );

    assert.equal(snapshot.objects[0]._id, 'database-id');
  });

  it('sorts objects and nested keys consistently regardless of database order', async () => {
    const objects = [
      { type: 'source', x: 8, y: 9, store: { z: 2, a: 1 } },
      { type: 'creep', x: 2, y: 3, name: 'Worker' },
    ];
    const first = await CaptureRoomSnapshot(createWorld(objects), 'W0N1');
    const second = await CaptureRoomSnapshot(createWorld(objects.slice().reverse()), 'W0N1');

    assert.deepEqual(first, second);
  });

  it('renders terrain separately and calls out multiple objects on one tile', async () => {
    const snapshot = await CaptureRoomSnapshot(
      createWorld([
        { type: 'source', x: 2, y: 3 },
        { type: 'controller', x: 2, y: 3 },
        { type: 'spawn', x: 5, y: 3 },
      ]),
      'W0N1',
    );

    const rendered = RenderRoomSnapshot(snapshot, 'Before tick');
    assert.include(rendered, 'Before tick: W0N1 at tick 123');
    assert.include(rendered, 'Terrain (. plain, # wall, : swamp)');
    assert.include(rendered, 'Objects');
    assert.include(rendered, 'Overlaps: (2,3): controller, source');
    assert.include(rendered, '* overlapping objects');
  });
});
