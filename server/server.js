const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const players = require("./players.js");

const TEAM_PURSE = 1200000000; // 120 Crore
const TEAM_NAMES = ["CSK", "MI", "RCB", "KKR", "SRH", "GT", "RR", "LSG"];

function createTeams() {
  const t = {};
  TEAM_NAMES.forEach((name) => {
    t[name] = { purse: TEAM_PURSE };
  });
  return t;
}

function getIncrement(price) {
  if (price < 10000000) return 1000000;   // < 1 Cr  → 10 lakh
  if (price < 20000000) return 2000000;   // 1–2 Cr  → 20 lakh
  if (price < 50000000) return 2500000;   // 2–5 Cr  → 25 lakh
  return 5000000;                         // > 5 Cr  → 50 lakh
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, "..", "public")));

const TIMER_SECONDS = 30;

let teams = createTeams();
let auctionState = {
  isRunning: false,
  isPaused: false,
  currentPlayer: null,
  currentBid: 0,
  highestBidder: null,
  timer: TIMER_SECONDS,
  playerIndex: -1,
  timerInterval: null,
  soldPlayers: [],
};

function startTimer() {
  if (auctionState.timerInterval) clearInterval(auctionState.timerInterval);
  auctionState.timer = TIMER_SECONDS;
  io.emit("timerUpdate", { timer: auctionState.timer });

  auctionState.timerInterval = setInterval(() => {
    if (!auctionState.isRunning || auctionState.isPaused) return;
    auctionState.timer--;
    io.emit("timerUpdate", { timer: auctionState.timer });

    if (auctionState.timer <= 0) {
      clearInterval(auctionState.timerInterval);
      auctionState.timerInterval = null;
      const team = auctionState.highestBidder;
      const price = auctionState.currentBid;
      const playerName = auctionState.currentPlayer ? auctionState.currentPlayer.name : "—";
      if (team && teams[team]) {
        teams[team].purse -= price;
        io.emit("purseUpdate", teams);
      }
      const sold = {
        player: playerName,
        team: team || "Unsold",
        price: price,
      };
      auctionState.soldPlayers.push(sold);
      io.emit("auctionEnd", { sold, history: auctionState.soldPlayers });
      io.emit("soldPlayers", auctionState.soldPlayers);
      nextPlayer();
    }
  }, 1000);
}

function broadcastPlayer() {
  if (auctionState.playerIndex >= 0 && auctionState.playerIndex < players.length) {
    auctionState.currentPlayer = players[auctionState.playerIndex];
    auctionState.currentBid = auctionState.currentPlayer.basePrice;
    auctionState.highestBidder = null;
    auctionState.timer = TIMER_SECONDS;
    io.emit("playerUpdate", {
      currentPlayer: auctionState.currentPlayer,
      currentBid: auctionState.currentBid,
      highestBidder: auctionState.highestBidder,
      playerIndex: auctionState.playerIndex,
      totalPlayers: players.length,
    });
    startTimer();
  } else {
    auctionState.isRunning = false;
    auctionState.currentPlayer = null;
    io.emit("playerUpdate", {
      currentPlayer: null,
      currentBid: 0,
      highestBidder: null,
      playerIndex: auctionState.playerIndex,
      totalPlayers: players.length,
      auctionComplete: true,
    });
  }
}

function nextPlayer() {
  auctionState.playerIndex++;
  if (auctionState.isRunning && auctionState.playerIndex < players.length) {
    broadcastPlayer();
  } else {
    auctionState.isRunning = false;
    if (auctionState.timerInterval) {
      clearInterval(auctionState.timerInterval);
      auctionState.timerInterval = null;
    }
    io.emit("playerUpdate", {
      currentPlayer: null,
      currentBid: 0,
      highestBidder: null,
      playerIndex: auctionState.playerIndex,
      totalPlayers: players.length,
      auctionComplete: true,
    });
  }
}

io.on("connection", (socket) => {
  socket.emit("joinAuction", {
    ...auctionState,
    currentPlayer: auctionState.currentPlayer,
    currentBid: auctionState.currentBid,
    highestBidder: auctionState.highestBidder,
    timer: auctionState.timer,
    playerIndex: auctionState.playerIndex,
    totalPlayers: players.length,
    soldPlayers: auctionState.soldPlayers,
    teams: teams,
  });

  socket.on("bid", (data) => {
    const team = data && data.team;
    if (!auctionState.currentPlayer) {
   socket.emit("bidError", { message: "No active player." });
   return;
   }
    if (!auctionState.isRunning || auctionState.isPaused) {
      socket.emit("bidError", { message: "Auction not active." });
      return;
    }
    if (!team || !TEAM_NAMES.includes(team)) {
      socket.emit("bidError", { message: "Invalid team." });
      return;
    }
    if (auctionState.highestBidder === team) {
      socket.emit("bidError", { message: "Another team must bid before you can bid again." });
      return;
    }
    const increment = getIncrement(auctionState.currentBid);
    const nextBid = auctionState.currentBid + increment;
    if (teams[team].purse < nextBid) {
      socket.emit("bidError", { message: "Insufficient purse for next bid." });
      return;
    }
    auctionState.currentBid = nextBid;
    auctionState.highestBidder = team;
    startTimer();
    io.emit("newBid", {
  currentBid: auctionState.currentBid,
  highestBidder: auctionState.highestBidder,
  increment: increment
});	
  });

  socket.on("admin:startAuction", () => {
    teams = createTeams();
    io.emit("purseUpdate", teams);
    auctionState.isRunning = true;
    auctionState.isPaused = false;
    auctionState.playerIndex = 0;
    auctionState.soldPlayers = [];
    broadcastPlayer();
  });

  socket.on("admin:nextPlayer", () => {
    if (auctionState.timerInterval) {
      clearInterval(auctionState.timerInterval);
      auctionState.timerInterval = null;
    }
    const team = auctionState.highestBidder;
    const price = auctionState.currentBid;
    const playerName = auctionState.currentPlayer ? auctionState.currentPlayer.name : "—";
    if (auctionState.currentPlayer) {
      if (team && teams[team]) {
        teams[team].purse -= price;
        io.emit("purseUpdate", teams);
      }
      const sold = {
        player: playerName,
        team: team || "Unsold",
        price: price,
      };
      auctionState.soldPlayers.push(sold);
      io.emit("auctionEnd", { sold, history: auctionState.soldPlayers });
      io.emit("soldPlayers", auctionState.soldPlayers);
    }
    nextPlayer();
  });

  socket.on("admin:pauseAuction", () => {
    auctionState.isPaused = !auctionState.isPaused;
    if (auctionState.isPaused && auctionState.timerInterval) {
      clearInterval(auctionState.timerInterval);
      auctionState.timerInterval = null;
    } else if (!auctionState.isPaused && auctionState.isRunning) {
      startTimer();
    }
    io.emit("auctionPaused", { isPaused: auctionState.isPaused });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`IPL Auction server running at http://localhost:${PORT}`);
});
