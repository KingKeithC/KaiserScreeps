// inject mocha globally to allow custom interface refer without direct import - bypass bundle issue
global._ = require('lodash');
global.mocha = require('mocha');
global.chai = require('chai');
global.sinon = require('sinon');
global.chai.use(require('sinon-chai'));
Object.assign(global, require('@screeps/common/lib/constants'));
[
  'ConstructionSite',
  'Creep',
  'Deposit',
  'Flag',
  'Game',
  'InterShardMemory',
  'Mineral',
  'Nuke',
  'OwnedStructure',
  'PathFinder',
  'PowerCreep',
  'RawMemory',
  'Resource',
  'Room',
  'RoomObject',
  'RoomPosition',
  'RoomVisual',
  'Ruin',
  'Source',
  'Store',
  'Structure',
  'StructureContainer',
  'StructureController',
  'StructureExtension',
  'StructureExtractor',
  'StructureFactory',
  'StructureInvaderCore',
  'StructureKeeperLair',
  'StructureLab',
  'StructureLink',
  'StructureNuker',
  'StructureObserver',
  'StructurePortal',
  'StructurePowerBank',
  'StructurePowerSpawn',
  'StructureRampart',
  'StructureRoad',
  'StructureSpawn',
  'StructureStorage',
  'StructureTerminal',
  'StructureTower',
  'StructureWall',
  'Tombstone',
].forEach(name => {
  global[name] = class {};
});
global.Room = class {
  constructor(name) {
    this.name = name;
  }
};
global.Game = Object.assign(class {}, { rooms: { sim: true }, creeps: {}, spawns: {}, time: 0 });
global.Memory = {};

// Override ts-node compiler options
process.env.TS_NODE_PROJECT = 'tsconfig.test.json';
