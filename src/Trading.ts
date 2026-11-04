import { Colony } from 'Colony';
import { RoomExtra } from 'Room';

declare global {
  interface TerminalMemory {
    roomName: Room['name'];
    lastInventory: StoreDefinition;
  }
}

export class TradingSystem {
  constructor(private colony: Colony) {}

  OncePerTick(): void {
    Memory.terminals ??= {};
    // Gather list of best trades from the market
    // Inspect Terminals lastInventory to determine what can be dealt
    return;
  }

  InitializeTerminal(terminal: StructureTerminal): TerminalMemory {
    return { roomName: terminal.room.name, lastInventory: terminal.store };
  }

  UpdateTerminal(terminal: StructureTerminal): void {
    Memory.terminals[terminal.id].lastInventory = terminal.store;
  }

  OncePerRoom(room: RoomExtra) {
    if (room.terminal === undefined) return;
    Memory.terminals[room.terminal.id] ??= this.InitializeTerminal(room.terminal);

    // Execute Deals

    this.UpdateTerminal(room.terminal);
  }
}
