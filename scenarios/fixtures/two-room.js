'use strict';

const { spec } = require('screeps-integration-tests');

const MAIN = 'W0N1';
const TOP = 'W0N2';
const SPAWN = { x: 25, y: 25 };

function twoRoomWorld() {
  return {
    rooms: [
      {
        name: MAIN,
        controller: spec.controller({ level: 1, x: 32, y: 32 }),
        sources: [spec.source(15, 15)],
        structures: [spec.spawn(SPAWN.x, SPAWN.y)],
        terrain: { walls: Array.from({ length: 30 }, (_, index) => ({ x: index + 10, y: 5 })) },
      },
      { name: TOP, sources: [spec.source(25, 25)] },
    ],
    bots: [{ username: 'bot', rooms: [MAIN] }],
  };
}

module.exports = { MAIN, TOP, SPAWN, twoRoomWorld };
