// monitor.js
import fetch from 'node-fetch';
import { state, closePosition, save } from './state.js';
import { logTrade } from './logger.js';
import { unsubscribePosition } from './websocket.js';

const FEE_RATE = 0.00;

export async function monitor(config) {
  for (const p of state.positions) {
    await checkResolution(p);
  }
  save();
}

async function checkResolution(p) {
  const market = await fetchMarketById(p.marketId).catch(() => null);
  if (!market?.closed) return;

  const prices = JSON.parse(market.outcomePrices);
  let resolution = prices[0] === '1' ? 'YES' : prices[1] === '1' ? 'NO' : null;
  if (!resolution) return;

  const won = (p.side === 'YES' && resolution === 'YES') || (p.side === 'NO' && resolution === 'NO');
  const payout = won ? p.size : 0;
  const pnl = payout - p.cost - payout * FEE_RATE;

  state.wallet.balance += payout;
  closePosition(p.id, resolution, payout, pnl);
  
  unsubscribePosition(p.tokenId);
  
  logTrade(p, resolution, payout, pnl);
  console.log(`✅ RESOLVED ${p.slug} ${resolution} | P&L: $${pnl.toFixed(2)}`);
}

async function fetchMarketById(id) {
  return fetch(`https://gamma-api.polymarket.com/markets?id=${id}`).then(r => r.json()).then(d => d[0]);
}