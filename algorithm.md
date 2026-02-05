START CYCLE
    ↓
┌─────────────────────────────────────┐
│ 1. MONITOR EXISTING POSITIONS       │
└─────────────────────────────────────┘
    ↓
    For each open position:
        ↓
    ┌─────────────────────────────┐
    │ A. CHECK STOP LOSS          │
    └─────────────────────────────┘
        ↓
        Fetch market data
        Calculate current probability
        ↓
        Has probability dropped ≥ 0.15?
        ↓
    YES ─────────────────────► Fetch orderbook
                               Get best bid price
                               Calculate payout
                               ↓
                               Update wallet (+payout)
                               Close position
                               Lock eventId FOREVER
                               Log to CSV
                               ↓
    NO ──────────────────────► Continue
        ↓
    ┌─────────────────────────────┐
    │ B. CHECK RESOLUTION         │
    └─────────────────────────────┘
        ↓
        Is market closed?
        ↓
    NO ─────────────────────► Skip to next position
        ↓
    YES
        ↓
        Get resolution (YES/NO)
        ↓
        Did we win?
        ↓
    YES ────► Payout = size × 1.0
        ↓
    NO ─────► Payout = 0
        ↓
        Update wallet (+payout)
        Close position
        Lock eventId FOREVER
        Log to CSV
    ↓
┌─────────────────────────────────────┐
│ 2. SAVE STATE TO DISK               │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ 3. SCAN FOR NEW OPPORTUNITIES       │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ 3A. FETCH ALL EVENTS FROM API       │
└─────────────────────────────────────┘
    ↓
    Loop offset = 0, 100, 200...
        ↓
        GET https://gamma-api.polymarket.com/events
            ?closed=false
            &limit=100
            &offset={offset}
        ↓
        Add to events array
        ↓
        Stop when: no more results OR reached 1000 events
    ↓
┌─────────────────────────────────────┐
│ 3B. FILTER EVENTS                   │
└─────────────────────────────────────┘
    ↓
    For each event:
        ↓
        Is eventId locked? ────YES───► SKIP (already traded)
        ↓
        NO
        ↓
        For each market in event:
            ↓
        ┌─────────────────────────────┐
        │ FILTER 1: Slug Pattern      │
        └─────────────────────────────┘
            ↓
            Does slug contain:
            "15m", "spl", "1pt5", "2pt5",
            "3pt5", "4pt5", "win", "lose", "draw"?
            ↓
        YES ────────────────────► SKIP
            ↓
        NO
            ↓
        ┌─────────────────────────────┐
        │ FETCH MARKET DETAILS        │
        └─────────────────────────────┘
            ↓
            GET https://gamma-api.polymarket.com/markets
                ?slug={slug}
            ↓
            Parse: outcomePrices, clobTokenIds, endDate
            ↓
        ┌─────────────────────────────┐
        │ FILTER 2: Time Window       │
        └─────────────────────────────┘
            ↓
            Hours to close = (endDate - now) / 3600000
            ↓
            Is 0 < hours ≤ 4?
            ↓
        NO ─────────────────────► SKIP
            ↓
        YES
            ↓
            For each side (YES, NO):
                ↓
            ┌─────────────────────────────┐
            │ FILTER 3: Probability       │
            └─────────────────────────────┘
                ↓
                Calculate probability:
                - YES side: prices[0]
                - NO side: 1 - prices[0]
                ↓
                Is 0.85 ≤ prob ≤ 0.96?
                ↓
            NO ─────────────────────► SKIP
                ↓
            YES
                ↓
            ┌─────────────────────────────┐
            │ FETCH ORDERBOOK             │
            └─────────────────────────────┘
                ↓
                GET https://clob.polymarket.com/book
                    ?token_id={tokenId}
                ↓
                Get all asks (sell orders)
                ↓
            ┌─────────────────────────────┐
            │ FILTER 4: Ask Price         │
            └─────────────────────────────┘
                ↓
                bestAsk = minimum ask price
                ↓
                Is 0.85 ≤ bestAsk ≤ 0.96?
                ↓
            NO ─────────────────────► SKIP
                ↓
            YES
                ↓
            ┌─────────────────────────────┐
            │ FILTER 5: Liquidity         │
            └─────────────────────────────┘
                ↓
                size = sum of all asks at bestAsk price
                liquidity = bestAsk × size
                ↓
                Is liquidity ≥ $10?
                ↓
            NO ─────────────────────► SKIP
                ↓
            YES
                ↓
            ┌─────────────────────────────┐
            │ ADD TO ELIGIBLE LIST        │
            └─────────────────────────────┘
                Store: {
                    eventId,
                    marketId,
                    slug,
                    side,
                    tokenId,
                    probability,
                    bestAsk,
                    askSize,
                    hoursToClose
                }
    ↓
┌─────────────────────────────────────┐
│ 4. EXECUTE TRADES                   │
└─────────────────────────────────────┘
    ↓
    Input: eligible markets array
    ↓
    Is array empty? ───YES───► END CYCLE
    ↓
    NO
    ↓
    W = current wallet balance
    N = number of eligible markets
    ↓
    baseAllocation = W / N
    allocation = min(baseAllocation, $2 cap)
    ↓
    For each market:
        ↓
        price = bestAsk
        maxSize = min(allocation/price, askSize)
        cost = maxSize × price
        ↓
        Is cost > wallet? ───YES───► SKIP
        ↓
        NO
        ↓
    ┌─────────────────────────────┐
    │ EXECUTE TRADE               │
    └─────────────────────────────┘
        ↓
        wallet.balance -= cost
        ↓
        Create position: {
            id: unique_id,
            eventId,
            marketId,
            slug,
            side,
            tokenId,
            entryPrice: price,
            entryProb: probability,
            size: maxSize,
            cost,
            boughtAt: timestamp
        }
        ↓
        Add to state.positions[]
        ↓
        Lock eventId in state.eventLocks
        ↓
        Log "✅ BUY {slug} {side} @ {price}"
    ↓
┌─────────────────────────────────────┐
│ 5. SAVE STATE TO DISK               │
└─────────────────────────────────────┘
    ↓
    Write state.json: {
        wallet: { balance },
        positions: [...],
        closedPositions: [...],
        eventLocks: [...]
    }
    ↓
END CYCLE
    ↓
    Wait 2 minutes
    ↓
    REPEAT FROM START