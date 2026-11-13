export type SnapshotValue = null | boolean | number | string | SnapshotValue[] | { [key: string]: SnapshotValue };

export interface RoomSnapshot {
  roomName: string;
  gameTime: number;
  terrain: string;
  objects: { [key: string]: SnapshotValue }[];
}

export interface RoomSnapshotOptions {
  includeObjectIds?: boolean;
}

interface RoomWorld {
  gameTime: number | Promise<number>;
  getTerrain(roomName: string): Promise<{ get(x: number, y: number): unknown }>;
  roomObjects(roomName: string): Promise<unknown[]>;
}

const ROOM_SIZE = 50;
const TERRAIN_CODES: { [key: string]: string } = { plain: '0', wall: '1', swamp: '2' };
const TERRAIN_GLYPHS: { [key: string]: string } = { '0': '.', '1': '#', '2': ':' };
const OBJECT_GLYPHS: { [key: string]: string } = {
  controller: 'C',
  source: 'S',
  mineral: 'M',
  creep: 'c',
  powerCreep: 'p',
  constructionSite: '+',
  resource: '$',
  droppedResource: '$',
  tombstone: 't',
  ruin: 'u',
  portal: '@',
  keeperLair: 'K',
  invaderCore: 'I',
  spawn: 'P',
  extension: 'e',
  road: '=',
  constructedWall: 'W',
  rampart: 'r',
  container: 'o',
  storage: 'D',
  terminal: 'T',
  tower: 'A',
  link: 'l',
  lab: 'L',
  extractor: 'x',
  observer: 'O',
  nuker: 'N',
  powerSpawn: 'Q',
  powerBank: 'B',
  factory: 'F',
};

function NormalizeValue(value: unknown, includeObjectIds: boolean, root = false): SnapshotValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(item => NormalizeValue(item, includeObjectIds));
  if (typeof value === 'object') {
    const normalized: { [key: string]: SnapshotValue } = {};
    Object.keys(value as { [key: string]: unknown })
      .sort()
      .forEach(key => {
        if (root && key === '_id' && !includeObjectIds) return;
        const item = (value as { [key: string]: unknown })[key];
        if (item !== undefined) normalized[key] = NormalizeValue(item, includeObjectIds);
      });
    return normalized;
  }
  throw new Error(`Room snapshot contains a non-JSON value: ${typeof value}`);
}

function TerrainCode(value: unknown): string {
  if (typeof value === 'number' && value >= 0 && value <= 2 && Number.isInteger(value)) return String(value);
  if (typeof value === 'string' && TERRAIN_CODES[value] !== undefined) return TERRAIN_CODES[value];
  throw new Error(`Unknown room terrain value: ${String(value)}`);
}

function ObjectType(object: { [key: string]: SnapshotValue }): string {
  const type = object.type;
  return typeof type === 'string' ? type : 'unknown';
}

function ObjectGlyph(type: string): string {
  return OBJECT_GLYPHS[type] || '?';
}

function ObjectDescription(object: { [key: string]: SnapshotValue }): string {
  const parts = [ObjectType(object)];
  if (typeof object.name === 'string') parts.push(JSON.stringify(object.name));
  if (typeof object._id === 'string') parts.push(`#${object._id}`);
  return parts.join(' ');
}

function RenderGrid(title: string, cells: string[][]): string[] {
  const tens = Array.from({ length: ROOM_SIZE }, (_, x) => String(Math.floor(x / 10) % 10)).join('');
  const units = Array.from({ length: ROOM_SIZE }, (_, x) => String(x % 10)).join('');
  return [
    title,
    `   ${tens}`,
    `   ${units}`,
    ...cells.map((row, y) => `${String(y).padStart(2, '0')} ${row.join('')}`),
  ];
}

export async function CaptureRoomSnapshot(
  world: RoomWorld,
  roomName: string,
  options: RoomSnapshotOptions = {},
): Promise<RoomSnapshot> {
  const [gameTime, terrain, roomObjects] = await Promise.all([
    Promise.resolve(world.gameTime),
    world.getTerrain(roomName),
    world.roomObjects(roomName),
  ]);
  let terrainData = '';
  for (let y = 0; y < ROOM_SIZE; y += 1) {
    for (let x = 0; x < ROOM_SIZE; x += 1) terrainData += TerrainCode(terrain.get(x, y));
  }

  const objects = roomObjects
    .map(roomObject => NormalizeValue(roomObject, options.includeObjectIds === true, true))
    .map(roomObject => {
      if (roomObject === null || Array.isArray(roomObject) || typeof roomObject !== 'object') {
        throw new Error('Room snapshot objects must be JSON objects');
      }
      return roomObject as { [key: string]: SnapshotValue };
    })
    .sort((left, right) => {
      const leftText = JSON.stringify(left);
      const rightText = JSON.stringify(right);
      return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
    });

  return { roomName, gameTime, terrain: terrainData, objects };
}

export function RenderRoomSnapshot(snapshot: RoomSnapshot, label = ''): string {
  if (snapshot.terrain.length !== ROOM_SIZE * ROOM_SIZE) {
    throw new Error(`Room snapshot terrain must contain ${ROOM_SIZE * ROOM_SIZE} cells`);
  }
  const title = `${label ? `${label}: ` : ''}${snapshot.roomName} at tick ${snapshot.gameTime}`;
  const terrainCells = Array.from({ length: ROOM_SIZE }, (_, y) =>
    Array.from({ length: ROOM_SIZE }, (unused, x) => TERRAIN_GLYPHS[snapshot.terrain[y * ROOM_SIZE + x]] || '?'),
  );
  const objectsByPosition = new Map<number, { [key: string]: SnapshotValue }[]>();
  snapshot.objects.forEach(object => {
    const x = object.x;
    const y = object.y;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isInteger(x) || !Number.isInteger(y)) return;
    if (x < 0 || y < 0 || x >= ROOM_SIZE || y >= ROOM_SIZE) return;
    const position = y * ROOM_SIZE + x;
    const objectsAtPosition = objectsByPosition.get(position) || [];
    objectsAtPosition.push(object);
    objectsByPosition.set(position, objectsAtPosition);
  });

  const objectCells = Array.from({ length: ROOM_SIZE }, (_, y) =>
    Array.from({ length: ROOM_SIZE }, (unused, x) => {
      const objectsAtPosition = objectsByPosition.get(y * ROOM_SIZE + x) || [];
      if (objectsAtPosition.length > 1) return '*';
      return objectsAtPosition.length === 1 ? ObjectGlyph(ObjectType(objectsAtPosition[0])) : ' ';
    }),
  );
  const output = [
    title,
    ...RenderGrid('Terrain (. plain, # wall, : swamp)', terrainCells),
    ...RenderGrid('Objects', objectCells),
  ];
  const glyphTypes = new Map<string, Set<string>>();
  snapshot.objects.forEach(object => {
    const type = ObjectType(object);
    const glyph = ObjectGlyph(type);
    const types = glyphTypes.get(glyph) || new Set<string>();
    types.add(type);
    glyphTypes.set(glyph, types);
  });
  const legend = Array.from(glyphTypes.entries())
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([glyph, types]) => `${glyph} ${Array.from(types).sort().join('/')}`);
  output.push(`Legend: ${legend.length ? legend.join(', ') : '(no objects)'}`, '* overlapping objects');

  const collisions = Array.from(objectsByPosition.entries())
    .filter(([, objectsAtPosition]) => objectsAtPosition.length > 1)
    .sort(([left], [right]) => left - right)
    .map(([position, objectsAtPosition]) => {
      const x = position % ROOM_SIZE;
      const y = Math.floor(position / ROOM_SIZE);
      return `(${x},${y}): ${objectsAtPosition.map(ObjectDescription).join(', ')}`;
    });
  if (collisions.length > 0) output.push(`Overlaps: ${collisions.join('; ')}`);
  return output.join('\n');
}
