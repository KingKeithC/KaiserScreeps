const { readFileSync } = require('fs');
const _ = require('lodash');
const { ScreepsServer, stdHooks } = require('screeps-server-mockup');
import type ScreepsServerType from 'screeps-server-mockup/dist/src/screepsServer';
import type User from 'screeps-server-mockup/dist/src/user';
import { CaptureRoomSnapshot, RenderRoomSnapshot, RoomSnapshot } from './roomSnapshot';
const DIST_MAIN_JS = 'dist/main.js';
const DIST_MAIN_MAP_JS = 'dist/main.js.map.js';

export interface WorldCreep {
  name: string;
  type: 'creep';
  x: number;
  y: number;
}

/*
 * Helper class for creating a ScreepsServer and resetting it between tests.
 * See https://github.com/Hiryus/screeps-server-mockup for instructions on
 * manipulating the terrain and game state.
 */
class IntegrationTestHelper {
  private _server!: ScreepsServerType;
  private _player!: User;

  get server() {
    return this._server;
  }

  get player() {
    return this._player;
  }

  async snapshotRoom(roomName = 'W0N1', label = 'Room snapshot'): Promise<RoomSnapshot> {
    const snapshot = await CaptureRoomSnapshot(this._server.world, roomName);
    console.info(RenderRoomSnapshot(snapshot, label));
    return snapshot;
  }

  async getCreep(name: string, roomName = 'W0N1'): Promise<WorldCreep | undefined> {
    const roomObjects: unknown[] = await this._server.world.roomObjects(roomName);
    return roomObjects.find((object): object is WorldCreep => {
      if (typeof object !== 'object' || object === null) return false;
      const candidate = object as Partial<WorldCreep>;
      return (
        candidate.type === 'creep' &&
        candidate.name === name &&
        typeof candidate.x === 'number' &&
        typeof candidate.y === 'number'
      );
    });
  }

  async addSpawnedCreep(
    name: string,
    roomName = 'W0N1',
    body: BodyPartConstant[] = [MOVE],
    x = 20,
    y = 20,
  ): Promise<void> {
    const hits = body.length * 100;
    const storeCapacity = body.filter(part => part === CARRY).length * CARRY_CAPACITY;
    const ageTime = (await this._server.world.gameTime) + CREEP_LIFE_TIME;

    await this._server.world.addRoomObject(roomName, 'creep', x, y, {
      name,
      user: this._player.id,
      body: body.map(t => ({ type: t, hits: 100 })),
      store: { energy: 0 },
      storeCapacity,
      hits,
      hitsMax: hits,
      spawning: false,
      fatigue: 0,
      notifyWhenAttacked: true,
      ageTime,
    });
    await this._player.console(
      `Memory.creeps[${JSON.stringify(name)}] = { role: 'Worker', room: ${JSON.stringify(roomName)} }`,
    );
  }

  private async logStep<T>(label: string, operation: () => Promise<T> | T): Promise<T> {
    const startedAt = Date.now();
    console.info(`[integration] ${label}: started`);
    try {
      const result = await operation();
      console.info(`[integration] ${label}: completed in ${Date.now() - startedAt}ms`);
      return result;
    } catch (error) {
      console.error(`[integration] ${label}: failed after ${Date.now() - startedAt}ms`, error);
      throw error;
    }
  }

  protected async deployPlayer() {
    // add a player with the built dist/main.js file
    console.info('[integration] reading bot bundle');
    const modules = {
      main: readFileSync(DIST_MAIN_JS).toString(),
      'main.js.map': readFileSync(DIST_MAIN_MAP_JS).toString(),
    };
    this._player = await this.logStep('adding player', () =>
      this._server.world.addBot({ username: 'player', room: 'W0N1', x: 15, y: 15, modules }),
    );
  }

  async beforeEach() {
    console.info('[integration] creating server');
    process.env.STORAGE_HOST = '127.0.0.1';
    this._server = new ScreepsServer();
    this._server.on('info', (message: string) => console.info(`[integration] server: ${message}`));
    this._server.on('error', (error: Error) => console.error('[integration] server error:', error));

    const startProcess = this._server.startProcess.bind(this._server);
    this._server.startProcess = async (name: string, execPath: string, env: NodeJS.ProcessEnv) => {
      if (name === 'storage') {
        env = { ...env, STORAGE_HOST: '127.0.0.1' };
      }
      const child = await startProcess(name, execPath, env);
      child.on('message', (message: unknown) => console.info(`[integration] ${name} message:`, message));
      return child;
    };

    // reset world but add invaders and source keepers bots
    await this.logStep('connecting to server storage', () => this._server.connect());
    await this.logStep('resetting world', () => this._server.world.reset());

    // create a stub world composed of 9 rooms with sources and controller
    await this.logStep('stubbing world', () => this._server.world.stubWorld());

    // deploy the player bot to the server
    await this.deployPlayer();

    // Start server
    await this.logStep('starting server', () => this._server.start());
  }

  async afterEach() {
    await this.logStep('stopping server', () => this._server.stop());
  }
}

export function registerIntegrationHooks() {
  beforeEach(async () => {
    await helper.beforeEach();
  });

  afterEach(async () => {
    await helper.afterEach();
  });

  before(() => {
    stdHooks.hookWrite();
  });
}

export const helper = new IntegrationTestHelper();
