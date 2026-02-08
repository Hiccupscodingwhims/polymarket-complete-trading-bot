// state.js
import fs from 'fs';

const STATE_FILE = './state.json';

export const state = {
  wallet: { balance: 50 },
  positions: [],           // { id, eventId, marketId, slug, side, tokenId, entryPrice, entryProb, size, cost, boughtAt }
  closedPositions: [],     // Same structure + { closedAt, resolution, payout, pnl }
  eventLocks: new Set(),   // Set of locked eventIds
  lastScan: null
};

export function save() {
  fs.writeFileSync(STATE_FILE, JSON.stringify({
    ...state,
    eventLocks: Array.from(state.eventLocks)
  }, null, 2));
}

export function load() {
  if (!fs.existsSync(STATE_FILE)) return;
  const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  state.wallet = data.wallet;
  state.positions = data.positions || [];
  state.closedPositions = data.closedPositions || [];
  state.eventLocks = new Set(data.eventLocks || []);
  state.lastScan = data.lastScan;
}

export function lockEvent(eventId) {
  state.eventLocks.add(eventId);
}

export function isEventLocked(eventId) {
  return state.eventLocks.has(eventId);
}

export function addPosition(pos) {
  state.positions.push({ ...pos, id: Date.now() + Math.random() });
  lockEvent(pos.eventId);
}

export function closePosition(posId, resolution, payout, pnl) {
  const idx = state.positions.findIndex(p => p.id === posId);
  if (idx === -1) return;
  
  const pos = state.positions.splice(idx, 1)[0];
  state.closedPositions.push({
    ...pos,
    closedAt: new Date().toISOString(),
    resolution,
    payout,
    pnl
  });
  
  // Unlock event after position closes
  state.eventLocks.delete(pos.eventId);
}