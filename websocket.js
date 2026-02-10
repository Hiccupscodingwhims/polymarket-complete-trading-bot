// websocket.js
import WebSocket from 'ws';
import { state, closePosition, save } from './state.js';
import { logTrade } from './logger.js';

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const RECONNECT_DELAY = 5000;
const FEE_RATE = 0.00;

let ws = null;
let reconnectTimeout = null;

export function startWebSocket(config) {
  connect(config);
}

function connect(config) {
  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('🔌 WebSocket connected');
    subscribeToAllPositions();
  });

  ws.on('message', (data) => {
    handleMessage(data, config);
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket disconnected, reconnecting in 5s...');
    reconnectTimeout = setTimeout(() => connect(config), RECONNECT_DELAY);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

function subscribeToAllPositions() {
  for (const p of state.positions) {
    subscribe(p.tokenId);
  }
}

function subscribe(tokenId) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'subscribe',
      market: tokenId
    }));
  }
}

function unsubscribe(tokenId) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'unsubscribe',
      market: tokenId
    }));
  }
}

function handleMessage(data, config) {
  try {
    const msg = JSON.parse(data);
    
    if (msg.event_type === 'book') {
      checkStopLossForToken(msg.asset_id, msg.bids, config);
    }
  } catch (err) {
    // Ignore parse errors
  }
}

function checkStopLossForToken(tokenId, bids, config) {
  const position = state.positions.find(p => p.tokenId === tokenId);
  if (!position || !bids?.length) return;

  const bestBid = Math.max(...bids.map(b => Number(b.price)));
  const priceDrop = (position.entryPrice - bestBid) / position.entryPrice;

  if (priceDrop >= config.STOP_PRICE_DROP) {
    executeStopLoss(position, bestBid);
  }
}

function executeStopLoss(position, bestBid) {
  const payout = position.size * bestBid;
  const pnl = payout - position.cost - payout * FEE_RATE;

  state.wallet.balance += payout;
  closePosition(position.id, 'STOP_LOSS', payout, pnl);
  
  unsubscribe(position.tokenId);
  
  logTrade(position, 'STOP_LOSS', payout, pnl);
  console.log(`🛑 STOP ${position.slug} | Entry: ${position.entryPrice.toFixed(3)} | Exit: ${bestBid.toFixed(3)} | P&L: $${pnl.toFixed(2)}`);
  
  save();
}

export function subscribePosition(tokenId) {
  subscribe(tokenId);
}

export function unsubscribePosition(tokenId) {
  unsubscribe(tokenId);
}

export function cleanup() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  if (ws) ws.close();
}