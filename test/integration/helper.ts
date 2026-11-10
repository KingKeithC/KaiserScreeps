const { readFileSync } = require('fs');
const _ = require('lodash');
const { ScreepsServer, stdHooks } = require('screeps-server-mockup');
const DIST_MAIN_JS = 'dist/main.js';
const DIST_MAIN_MAP_JS = 'dist/main.js.map.js';

/*
 * Helper class for creating a ScreepsServer and resetting it between tests.
 * See https://github.com/Hiryus/screeps-server-mockup for instructions on
 * manipulating the terrain and game state.
 */
class IntegrationTestHelper {
  private _server: any;
  private _player: any;

  get server() {
    return this._server;
  }

  get player() {
    return this._player;
  }

  private async logStep<T>(label: string, operation: () => Promise<T>): Promise<T> {
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

  async beforeEach() {
    console.info('[integration] creating server');
    process.env.STORAGE_HOST = '127.0.0.1';
    this._server = new ScreepsServer();
    this._server.on('info', (message: string) => console.info(`[integration] server: ${message}`));
    this._server.on('error', (error: Error) => console.error('[integration] server error:', error));

    const startProcess = this._server.startProcess.bind(this._server);
    this._server.startProcess = async (name: string, ...args: any[]) => {
      if (name === 'storage') {
        args[1] = { ...args[1], STORAGE_HOST: '127.0.0.1' };
      }
      const child = await startProcess(name, ...args);
      child.on('message', (message: unknown) => console.info(`[integration] ${name} message:`, message));
      return child;
    };

    // reset world but add invaders and source keepers bots
    await this.logStep('connecting to server storage', () => this._server.connect());
    await this.logStep('resetting world', () => this._server.world.reset());

    // create a stub world composed of 9 rooms with sources and controller
    await this.logStep('stubbing world', () => this._server.world.stubWorld());

    // add a player with the built dist/main.js file
    console.info('[integration] reading bot bundle');
    const modules = {
      main: readFileSync(DIST_MAIN_JS).toString(),
      'main.js.map': readFileSync(DIST_MAIN_MAP_JS).toString(),
    };
    this._player = await this.logStep('adding player', () =>
      this._server.world.addBot({ username: 'player', room: 'W0N1', x: 15, y: 15, modules }),
    );

    // Start server
    await this.logStep('starting server', () => this._server.start());
  }

  async afterEach() {
    await this.logStep('stopping server', () => this._server.stop());
  }
}

beforeEach(async () => {
  await helper.beforeEach();
});

afterEach(async () => {
  await helper.afterEach();
});

before(() => {
  stdHooks.hookWrite();
});

export const helper = new IntegrationTestHelper();
