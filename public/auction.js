const socket = io();

const urlParams = new URLSearchParams(window.location.search);
const roomIdFromUrl = urlParams.get("room");

if (!roomIdFromUrl) {
  window.location.href = "/";
}

// UI Elements
const displayRoomId = document.getElementById("displayRoomId");
const btnCopyRoomId = document.getElementById("btnCopyRoomId");
const placeholder = document.getElementById("placeholder");
const playerDetails = document.getElementById("playerDetails");
const playerAvatar = document.getElementById("playerAvatar");
const playerName = document.getElementById("playerName");
const playerRole = document.getElementById("playerRole");
const basePriceEl = document.getElementById("basePrice");
const currentBidEl = document.getElementById("currentBid");
const highestBidderEl = document.getElementById("highestBidder");
const timerEl = document.getElementById("timer");
const timerBar = document.getElementById("timerBar");
const currentBidLogEl = document.getElementById("currentBidLog");
const bidDisplay = document.querySelector(".bid-display");
const playerProgress = document.getElementById("playerProgress");
const soldBadge = document.getElementById("soldBadge");
const teamSelect = document.getElementById("teamSelect");
const placeBidBtn = document.getElementById("placeBid");
const bidErrorEl = document.getElementById("bidError");
const historyList = document.getElementById("historyList");
const budgetList = document.getElementById("budgetList");

let hasTeam = false;
let isAuctionActive = false;

const teamLogos = {
  "RCB": "/images/RCB.png",
  "CSK": "/images/CSK.png",
  "MI": "/images/MI.png",
  "KKR": "/images/KKR.png",
  "SRH": "/images/SRH.png",
  "GT": "/images/GT.png",
  "RR": "/images/RR.png",
  "LSG": "/images/LSG.png",
};

function formatPrice(amount) {
  if (!amount && amount !== 0) return "₹0";
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return `₹${Number(amount).toLocaleString("en-IN")}`;
}

function showBidError(msg) {
  bidErrorEl.textContent = msg || "Bid failed.";
  bidErrorEl.classList.add("visible");
}

function clearBidError() {
  bidErrorEl.textContent = "";
  bidErrorEl.classList.remove("visible");
}

function updateBidBtnState() {
  placeBidBtn.disabled = !hasTeam || !isAuctionActive;
}

function renderPlayer(data) {
  const { currentPlayer, currentBid, highestBidder, playerIndex, totalPlayers, auctionComplete, currentBidLog } = data || {};
  if (auctionComplete || !currentPlayer) {
    placeholder.classList.remove("hidden");
    playerDetails.classList.add("hidden");
    placeholder.querySelector("p").textContent = auctionComplete ? "Auction complete." : "Waiting for auction to start...";
    isAuctionActive = false;
    updateBidBtnState();
    clearBidError();
    currentBidLogEl.innerHTML = "";
    return;
  }
  placeholder.classList.add("hidden");
  playerDetails.classList.remove("hidden");
  soldBadge.classList.add("hidden");
  isAuctionActive = true;
  updateBidBtnState();

  playerName.textContent = currentPlayer.name;
  
  if (playerAvatar) {
    const initials = currentPlayer.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    playerAvatar.textContent = initials;
  }

  playerRole.textContent = currentPlayer.role.replace("_", " ");
  playerRole.className = "role-badge " + currentPlayer.role.toLowerCase().replace("_", "-");

  basePriceEl.textContent = formatPrice(currentPlayer.basePrice);
  currentBidEl.textContent = formatPrice(currentBid);
  highestBidderEl.textContent = highestBidder || "—";
  const idx = (playerIndex ?? 0) + 1;
  playerProgress.textContent = `Player ${idx} / ${totalPlayers || 0}`;

  if (currentBidLog) renderCurrentBidLog(currentBidLog);
}

function renderCurrentBidLog(log) {
  if (!log || log.length === 0) {
    currentBidLogEl.innerHTML = "<li class=\"empty\">No bids yet</li>";
    return;
  }
  currentBidLogEl.innerHTML = log
    .map(b => `<li><span class="bid-team">${b.team}</span> <span class="bid-price">${formatPrice(b.price)}</span></li>`)
    .join("");
  currentBidLogEl.scrollTop = currentBidLogEl.scrollHeight;
}

function renderPurse(teams) {
  if (!teams || typeof teams !== "object") return;
  budgetList.innerHTML = Object.entries(teams)
    .map(([name, data]) => {
      const logo = teamLogos[name] ? `<img src="${teamLogos[name]}" class="team-logo-small" alt="${name} logo">` : "";
      return `<li>
        <span class="team-name">${logo}${name}</span> 
        <span class="team-budget">${formatPrice(data.purse)}</span>
      </li>`;
    })
    .join("");
}

function renderSoldPlayers(list) {
  if (!list || list.length === 0) {
    historyList.innerHTML = "<li class=\"empty\">No sales yet.</li>";
    return;
  }
  historyList.innerHTML = list
    .map((s) => {
      const name = typeof s.player === "string" ? s.player : (s.player && s.player.name) || "—";
      const team = s.team || s.boughtBy || "—";
      const isUnsold = team === "Unsold";
      const logo = teamLogos[team] ? `<img src="${teamLogos[team]}" class="team-logo-small" alt="${team} logo">` : "";
      const price = s.price != null ? formatPrice(s.price) : (s.finalBid != null ? formatPrice(s.finalBid) : "—");
      return `<li>
        <span class="sold-name">${name}</span> 
        <span class="sold-buyer ${isUnsold ? 'unsold' : ''}">${logo}→ ${team}</span> 
        <span class="sold-bid">${isUnsold ? '—' : price}</span>
      </li>`;
    })
    .join("");
}

function updateTimer(seconds) {
  timerEl.textContent = seconds;
  const percentage = (seconds / 30) * 100;
  if (timerBar) {
    timerBar.style.width = `${percentage}%`;
    timerBar.classList.toggle("urgent", seconds <= 10);
  }
  timerEl.classList.toggle("urgent", seconds <= 10);
}

// Join room on connect
socket.on("connect", () => {
  socket.emit("joinRoom", { roomId: roomIdFromUrl });
});

socket.on("joinAuction", (state) => {
  displayRoomId.textContent = state.roomId;
  renderPlayer(state);
  updateTimer(state.timer ?? 30);
  if (state.soldPlayers) renderSoldPlayers(state.soldPlayers);
  if (state.teams) renderPurse(state.teams);
  if (state.teamOwners) updateTeamSelection(state.teamOwners);
});

function updateTeamSelection(teamOwners) {
  const currentTeam = Object.keys(teamOwners).find(t => teamOwners[t] === socket.id);
  const selectedTeamLogo = document.getElementById("selectedTeamLogo");
  
  Array.from(teamSelect.options).forEach(option => {
    if (!option.value) return;
    const ownerId = teamOwners[option.value];
    if (ownerId && ownerId !== socket.id) {
      option.disabled = true;
      option.textContent = `${option.value} (Taken)`;
    } else {
      option.disabled = false;
      option.textContent = option.value;
    }
  });

  if (currentTeam) {
    teamSelect.value = currentTeam;
    teamSelect.disabled = true;
    hasTeam = true;
    if (teamLogos[currentTeam]) {
      selectedTeamLogo.src = teamLogos[currentTeam];
      selectedTeamLogo.classList.add("visible");
    }
  } else {
    teamSelect.disabled = false;
    hasTeam = false;
    selectedTeamLogo.classList.remove("visible");
  }
  updateBidBtnState();
}

teamSelect.addEventListener("change", () => {
  const team = teamSelect.value;
  if (team) {
    socket.emit("selectTeam", { team });
  }
});

placeBidBtn.addEventListener("click", () => {
  clearBidError();
  socket.emit("bid");
});

btnCopyRoomId.addEventListener("click", () => {
  navigator.clipboard.writeText(roomIdFromUrl);
  btnCopyRoomId.textContent = "Copied!";
  setTimeout(() => btnCopyRoomId.textContent = "Copy", 2000);
});

socket.on("playerUpdate", (data) => {
  renderPlayer(data);
  updateTimer(data.timer ?? 30);
});

socket.on("newBid", (data) => {
  currentBidEl.textContent = formatPrice(data.currentBid);
  highestBidderEl.textContent = data.highestBidder || "—";
  if (data.currentBidLog) renderCurrentBidLog(data.currentBidLog);
  if (bidDisplay) {
    bidDisplay.classList.add("bid-flash");
    setTimeout(() => bidDisplay.classList.remove("bid-flash"), 300);
  }
});

socket.on("timerUpdate", (data) => {
  updateTimer(data.timer);
});

socket.on("auctionEnd", (data) => {
  soldBadge.classList.remove("hidden");
  if (data.history) renderSoldPlayers(data.history);
  updateTimer(30);
});

socket.on("soldPlayers", renderSoldPlayers);
socket.on("purseUpdate", renderPurse);
socket.on("teamUpdate", updateTeamSelection);
socket.on("bidError", (data) => showBidError(data.message));
socket.on("error", (msg) => {
  alert(msg);
  window.location.href = "/";
});