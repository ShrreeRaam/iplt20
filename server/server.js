const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const players = require("./players.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "..", "public")));

const TEAM_PURSE = 1200000000; // 120 Crore
const TEAM_NAMES = ["CSK", "MI", "RCB", "KKR", "SRH", "GT", "RR", "LSG"];
const TIMER_SECONDS = 30;

const rooms = {};

function createTeams() {
  const t = {};
  TEAM_NAMES.forEach((name) => {
    t[name] = { purse: TEAM_PURSE };
  });
  return t;
}

function getIncrement(price) {
  if (price < 10000000) return 1000000; // < 1 Cr  → 10 lakh
  if (price < 20000000) return 2000000; // 1–2 Cr  → 20 lakh
  if (price < 50000000) return 2500000; // 2–5 Cr  → 25 lakh
  return 5000000; // > 5 Cr  → 50 lakh
}

function createAuctionState() {
  return {
    isRunning: false,
    isPaused: false,
    currentPlayer: null,
    currentBid: 0,
    highestBidder: null,
    timer: TIMER_SECONDS,
    playerIndex: -1,
    timerInterval: null,
    soldPlayers: [],
    currentBidLog: [],
  };
}

function generateRoomId() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function startTimer(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const state = room.auctionState;

  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timer = TIMER_SECONDS;
  io.to(roomId).emit("timerUpdate", { timer: state.timer });

  state.timerInterval = setInterval(() => {
    if (!state.isRunning || state.isPaused) return;
    state.timer--;
    io.to(roomId).emit("timerUpdate", { timer: state.timer });

    if (state.timer <= 0) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
      const team = state.highestBidder;
      const price = state.currentBid;
      const playerName = state.currentPlayer ? state.currentPlayer.name : "—";
      if (team && room.teams[team]) {
        room.teams[team].purse -= price;
        io.to(roomId).emit("purseUpdate", room.teams);
      }
      const sold = {
        player: playerName,
        team: team || "Unsold",
        price: price,
      };
      state.soldPlayers.push(sold);
      io.to(roomId).emit("auctionEnd", { sold, history: state.soldPlayers });
      io.to(roomId).emit("soldPlayers", state.soldPlayers);
      nextPlayer(roomId);
    }
  }, 1000);
}

function broadcastPlayer(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const state = room.auctionState;

  if (state.playerIndex >= 0 && state.playerIndex < players.length) {
    state.currentPlayer = players[state.playerIndex];
    state.currentBid = state.currentPlayer.basePrice;
    state.highestBidder = null;
    state.timer = TIMER_SECONDS;
    state.currentBidLog = [];
    io.to(roomId).emit("playerUpdate", {
      currentPlayer: state.currentPlayer,
      currentBid: state.currentBid,
      highestBidder: state.highestBidder,
      playerIndex: state.playerIndex,
      totalPlayers: players.length,
      currentBidLog: state.currentBidLog,
    });
    startTimer(roomId);
  } else {
    state.isRunning = false;
    state.currentPlayer = null;
    io.to(roomId).emit("playerUpdate", {
      currentPlayer: null,
      currentBid: 0,
      highestBidder: null,
      playerIndex: state.playerIndex,
      totalPlayers: players.length,
      auctionComplete: true,
    });
  }
}

function nextPlayer(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const state = room.auctionState;

  state.playerIndex++;
  if (state.isRunning && state.playerIndex < players.length) {
    broadcastPlayer(roomId);
  } else {
    state.isRunning = false;
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
    io.to(roomId).emit("playerUpdate", {
      currentPlayer: null,
      currentBid: 0,
      highestBidder: null,
      playerIndex: state.playerIndex,
      totalPlayers: players.length,
      auctionComplete: true,
    });
  }
}

io.on("connection", (socket) => {
  socket.on("createRoom", () => {
    let roomId;
    do {
      roomId = generateRoomId();
    } while (rooms[roomId]);

    rooms[roomId] = {
      admin: null, // Admin will be the first to join
      teams: createTeams(),
      teamOwners: {},
      auctionState: createAuctionState(),
      members: new Set(),
      createdAt: Date.now(),
    };

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.emit("roomCreated", { roomId });
    sendInitialState(socket, roomId);
  });

  socket.on("joinRoom", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("error", "Room not found");
      return;
    }
    socket.join(roomId);
    socket.data.roomId = roomId;
    room.members.add(socket.id);
    
    // First user to join a new room becomes the admin
    if (!room.admin) {
      room.admin = socket.id;
    }

    const isAdmin = socket.id === room.admin;
    sendInitialState(socket, roomId, isAdmin);
  });

  function sendInitialState(socket, roomId, isAdmin) {
    const room = rooms[roomId];
    const state = room.auctionState;
    socket.emit("joinAuction", {
      roomId,
      currentPlayer: state.currentPlayer,
      currentBid: state.currentBid,
      highestBidder: state.highestBidder,
      timer: state.timer,
      playerIndex: state.playerIndex,
      totalPlayers: players.length,
      soldPlayers: state.soldPlayers,
      currentBidLog: state.currentBidLog,
      teams: room.teams,
      teamOwners: room.teamOwners,
      isRunning: state.isRunning,
      isPaused: state.isPaused,
      isAdmin: isAdmin
    });
    socket.emit("purseUpdate", room.teams);
    socket.emit("teamUpdate", room.teamOwners);
  }

  socket.on("selectTeam", ({ team }) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room || !team || !TEAM_NAMES.includes(team)) return;
    if (socket.id === room.admin) {
      socket.emit("bidError", { message: "Admins cannot select a team." });
      return;
    }

    const alreadyOwns = Object.keys(room.teamOwners).find(t => room.teamOwners[t] === socket.id);
    if (alreadyOwns) {
      socket.emit("bidError", { message: "You have already selected a team." });
      return;
    }

    if (room.teamOwners[team]) {
      socket.emit("teamTaken");
      return;
    }

    room.teamOwners[team] = socket.id;
    io.to(roomId).emit("teamUpdate", room.teamOwners);
  });

  socket.on("bid", () => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id === room.admin) {
      socket.emit("bidError", { message: "Admins cannot place bids." });
      return;
    }
    const state = room.auctionState;

    if (!state.currentPlayer || !state.isRunning || state.isPaused) {
      socket.emit("bidError", { message: "Auction not active." });
      return;
    }

    const team = Object.keys(room.teamOwners).find((t) => room.teamOwners[t] === socket.id);
    if (!team) {
      socket.emit("bidError", { message: "Select a team first." });
      return;
    }

    if (state.highestBidder === team) {
      socket.emit("bidError", { message: "You are already the highest bidder." });
      return;
    }

    const increment = getIncrement(state.currentBid);
    const nextBid = state.currentBid + increment;
    if (room.teams[team].purse < nextBid) {
      socket.emit("bidError", { message: "Insufficient funds." });
      return;
    }

    state.currentBid = nextBid;
    state.highestBidder = team;
    state.currentBidLog.push({ team, price: nextBid });
    startTimer(roomId);
    io.to(roomId).emit("newBid", {
      currentBid: state.currentBid,
      highestBidder: state.highestBidder,
      increment,
      currentBidLog: state.currentBidLog,
    });
  });

  socket.on("admin:startAuction", () => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room || socket.id !== room.admin) return;

    room.teams = createTeams();
    room.auctionState = createAuctionState();
    const state = room.auctionState;
    state.isRunning = true;
    state.playerIndex = 0;

    io.to(roomId).emit("purseUpdate", room.teams);
    broadcastPlayer(roomId);
  });

  socket.on("admin:nextPlayer", () => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room || socket.id !== room.admin) return;
    const state = room.auctionState;

    if (state.timerInterval) clearInterval(state.timerInterval);
    
    const team = state.highestBidder;
    const price = state.currentBid;
    if (state.currentPlayer) {
      if (team && room.teams[team]) {
        room.teams[team].purse -= price;
        io.to(roomId).emit("purseUpdate", room.teams);
      }
      state.soldPlayers.push({
        player: state.currentPlayer.name,
        team: team || "Unsold",
        price: price,
      });
      io.to(roomId).emit("auctionEnd", { sold: state.soldPlayers[state.soldPlayers.length-1], history: state.soldPlayers });
      io.to(roomId).emit("soldPlayers", state.soldPlayers);
    }
    nextPlayer(roomId);
  });

  socket.on("admin:pauseAuction", () => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room || socket.id !== room.admin) return;
    const state = room.auctionState;

    state.isPaused = !state.isPaused;
    if (state.isPaused && state.timerInterval) {
      clearInterval(state.timerInterval);
    } else if (!state.isPaused && state.isRunning) {
      startTimer(roomId);
    }
    io.to(roomId).emit("auctionPaused", { isPaused: state.isPaused });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;

    Object.keys(room.teamOwners).forEach((team) => {
      if (room.teamOwners[team] === socket.id) delete room.teamOwners[team];
    });
    room.members.delete(socket.id);
    io.to(roomId).emit("teamUpdate", room.teamOwners);

    // If the room is very new, keep it alive for a few seconds to allow admin to rejoin
    const roomAge = Date.now() - room.createdAt;
    if (room.members.size === 0 && roomAge > 5000) {
      if (room.auctionState.timerInterval) clearInterval(room.auctionState.timerInterval);
      delete rooms[roomId];
      return;
    }

    if (room.admin === socket.id) {
      const nextAdmin = Array.from(room.members)[0];
      if (nextAdmin) {
        room.admin = nextAdmin;
        io.to(roomId).emit("adminChanged", { isAdmin: true, to: nextAdmin });
      } else {
        if (room.auctionState.timerInterval) clearInterval(room.auctionState.timerInterval);
        delete rooms[roomId];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`IPL Auction server running at http://localhost:${PORT}`);
});
