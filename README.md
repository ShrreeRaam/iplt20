# IPL Auction Simulator

Real-time IPL player auction simulator built with **Node.js**, **Express**, and **Socket.io**. Multiple users can join and place bids; an admin controls the flow.

## Tech Stack

- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Backend:** Node.js, Express.js, Socket.io
- **Data:** In-memory (no database); players defined in `server/players.js`

## Project Structure

```
ipl-auction-simple
├── server
│   ├── server.js      # Express + Socket.io, auction state & logic
│   ├── players.js     # Array of players (name, role, basePrice)
├── public
│   ├── index.html     # Main auction view (bidders)
│   ├── admin.html     # Admin panel (start / next / pause)
│   ├── style.css      # Dark theme, responsive
│   ├── script.js      # Client logic for index.html
│   ├── admin.js       # Client logic for admin.html
│   └── sounds         # Optional: bid.mp3, tick.mp3, hammer.mp3
└── package.json
```

## Running the Project

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Start the server**

   ```bash
   node server/server.js
   ```

   Or:

   ```bash
   npm start
   ```

3. **Open in browser**

   - **Auction (bidders):** [http://localhost:3000](http://localhost:3000)
   - **Admin panel:** [http://localhost:3000/admin.html](http://localhost:3000/admin.html)

Use two tabs (or two devices on the same network): one for admin, one or more for bidders.

## Features

- **Admin:** Start auction, move to next player, pause/resume.
- **Team budgets:** Eight teams (CSK, MI, RCB, KKR, SRH, GT, RR, LSG), each with ₹9 Cr; bids cannot exceed remaining budget; budget deducted on sale.
- **Team selection:** Bidders choose a team from a dropdown; bids sent as `placeBid` with `{ team, amount }`.
- **Bidding:** Minimum increment ₹5,00,000; 30-second timer that resets on each new bid.
- **Real-time:** All clients see current player, bid, highest bidder, timer, and team budgets via Socket.io.
- **SOLD:** When the timer hits zero, the player is marked SOLD, hammer sound plays, and the next player loads automatically.
- **Sold players:** Bottom panel lists all sold players (e.g. "Virat Kohli → RCB ₹20 Cr"); broadcast via `soldPlayers` event.
- **Sounds (optional):** Add `bid.mp3`, `tick.mp3`, and `hammer.mp3` in `public/sounds/` for bid, countdown, and sold effects. See `public/sounds/README.txt`.

## Socket Events

| Event           | Direction   | Description                          |
|----------------|------------|--------------------------------------|
| `joinAuction`  | Server → Client | Initial state (includes teams, soldPlayers) |
| `playerUpdate` | Server → Client | New player / auction state           |
| `placeBid`     | Client → Server | Bid with `{ team, amount }`          |
| `newBid`       | Server → Client | New bid broadcast                    |
| `timerUpdate`  | Server → Client | Countdown updates                    |
| `budgetUpdate` | Server → Client | Updated team budgets                 |
| `soldPlayers`  | Server → Client | Full sold players list               |
| `auctionEnd`   | Server → Client | Player sold, history update          |

## License

MIT
