const socket = io();

const placeholder = document.getElementById("placeholder");
const playerDetails = document.getElementById("playerDetails");
const playerName = document.getElementById("playerName");
const playerRole = document.getElementById("playerRole");
const basePriceEl = document.getElementById("basePrice");
const currentBidEl = document.getElementById("currentBid");
const highestBidderEl = document.getElementById("highestBidder");
const timerEl = document.getElementById("timer");
const playerProgress = document.getElementById("playerProgress");
const soldBadge = document.getElementById("soldBadge");
const teamSelect = document.getElementById("teamSelect");
const placeBidBtn = document.getElementById("placeBid");
const bidErrorEl = document.getElementById("bidError");
const historyList = document.getElementById("historyList");
const budgetList = document.getElementById("budgetList");

function formatPrice(amount) {
  if (!amount && amount !== 0) return "₹0";
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return `₹${Number(amount).toLocaleString("en-IN")}`;
}

function playSound(name) {
  try {
    const a = new Audio(`sounds/${name}.mp3`);
    a.volume = 0.5;
    a.play().catch(() => {});
  } catch (e) {}
}

function clearBidError() {
  bidErrorEl.textContent = "";
  bidErrorEl.classList.remove("visible");
}

function showBidError(msg) {
  bidErrorEl.textContent = msg || "Bid failed.";
  bidErrorEl.classList.add("visible");
}

function renderPlayer(data) {
  const { currentPlayer, currentBid, highestBidder, playerIndex, totalPlayers, auctionComplete } = data || {};
  if (auctionComplete || !currentPlayer) {
    placeholder.classList.remove("hidden");
    playerDetails.classList.add("hidden");
    placeholder.querySelector("p").textContent = auctionComplete ? "Auction complete." : "Waiting for auction to start...";
    placeBidBtn.disabled = true;
    clearBidError();
    return;
  }
  placeholder.classList.add("hidden");
  playerDetails.classList.remove("hidden");
  soldBadge.classList.add("hidden");

  playerName.textContent = currentPlayer.name;
  playerRole.textContent = currentPlayer.role.replace("_", " ");
  basePriceEl.textContent = formatPrice(currentPlayer.basePrice);
  currentBidEl.textContent = formatPrice(currentBid);
  currentBidEl.dataset.current = currentBid || currentPlayer.basePrice;
  highestBidderEl.textContent = highestBidder || "—";
  const idx = (playerIndex ?? 0) + 1;
  playerProgress.textContent = `Player ${idx} / ${totalPlayers || 0}`;
  placeBidBtn.disabled = false;
}

function updateBid(data) {
  currentBidEl.textContent = formatPrice(data.currentBid);
  currentBidEl.dataset.current = data.currentBid;
  highestBidderEl.textContent = data.highestBidder || "—";
  playSound("bid");
}

function updateTimer(seconds) {
  timerEl.textContent = seconds;
  timerEl.classList.toggle("urgent", seconds <= 10);
  if (seconds >= 1 && seconds < 30) playSound("tick");
}

function showSold() {
  soldBadge.classList.remove("hidden");
  playSound("hammer");
}

function renderPurse(teams) {
  if (!teams || typeof teams !== "object") return;
  budgetList.innerHTML = Object.entries(teams)
    .map(([name, data]) => `<li><span class="team-name">${name}</span> <span class="team-budget">${formatPrice(data.purse)}</span></li>`)
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
      const price = s.price != null ? formatPrice(s.price) : (s.finalBid != null ? formatPrice(s.finalBid) : "—");
      return `<li><span class="sold-name">${name}</span> <span class="sold-buyer">→ ${team}</span> <span class="sold-bid">${price}</span></li>`;
    })
    .join("");
}

socket.on("joinAuction", (state) => {
  renderPlayer(state);
  updateTimer(state.timer ?? 30);
  if (state.soldPlayers) renderSoldPlayers(state.soldPlayers);
  if (state.teams) renderPurse(state.teams);
});

socket.on("playerUpdate", (data) => {
  renderPlayer(data);
  updateTimer(data.timer ?? 30);
});

socket.on("newBid", updateBid);

socket.on("timerUpdate", (data) => {
  updateTimer(data.timer);
});

socket.on("auctionEnd", (data) => {
  showSold();
  if (data.history) renderSoldPlayers(data.history);
  updateTimer(30);
});

socket.on("soldPlayers", renderSoldPlayers);

socket.on("purseUpdate", renderPurse);

socket.on("bidError", (data) => {
  showBidError(data && data.message);
});

placeBidBtn.addEventListener("click", () => {
  const team = teamSelect.value ? teamSelect.value.trim() : "";
  clearBidError();
  if (!team) {
    teamSelect.focus();
    showBidError("Please select a team.");
    return;
  }
  socket.emit("bid", { team });
});
