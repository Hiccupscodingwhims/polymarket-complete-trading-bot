// logger.js
import fs from 'fs';

const CSV_FILE = './trades.csv';

if (!fs.existsSync(CSV_FILE)) {
  fs.writeFileSync(CSV_FILE, 'timestamp,slug,side,entryPrice,size,cost,resolution,payout,pnl\n');
}

export function logTrade(pos, resolution, payout, pnl) {
  const row = [
    new Date().toISOString(),
    pos.slug,
    pos.side,
    pos.entryPrice,
    pos.size.toFixed(4),
    pos.cost.toFixed(2),
    resolution,
    payout.toFixed(2),
    pnl.toFixed(2)
  ].join(',');
  
  fs.appendFileSync(CSV_FILE, row + '\n');
}