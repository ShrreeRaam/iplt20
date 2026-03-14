const socket = io();

const startBtn = document.getElementById("startAuction");
const nextBtn = document.getElementById("nextPlayer");
const pauseBtn = document.getElementById("pauseAuction");
const adminStatus = document.getElementById("adminStatus");
const adminHistoryList = document.getElementById("adminHistoryList");

function formatPrice(amount) {
  if (!amount) return "₹0";
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

function renderHistory(history) {
  if (!history || history.length === 0) {
    adminHistoryList.innerHTML = "<li class=\"empty\">No sales yet this session.</li>";
    return;
  }
  adminHistoryList.innerHTML = history
    .map((s) => {
      const name = typeof s.player === "string" ? s.player : (s.player?.name ?? "—");
      const team = s.team ?? s.boughtBy ?? "—";
      const price = s.price != null ? formatPrice(s.price) : formatPrice(s.finalBid);
      return `<li><span class="sold-name">${name}</span> <span class="sold-bid">${price}</span> <span class="sold-buyer">→ ${team}</span></li>`;
    })
    .join("");
}

socket.on("joinAuction", (state) => {
  if (state.soldPlayers) renderHistory(state.soldPlayers);
  nextBtn.disabled = !state.isRunning;
  pauseBtn.disabled = !state.isRunning;
  adminStatus.textContent = state.isRunning ? (state.isPaused ? "Auction paused." : "Auction in progress.") : "Auction not started.";
  if (state.isPaused !== undefined) {
    pauseBtn.textContent = state.isPaused ? "Resume Auction" : "Pause Auction";
  }
});

socket.on("playerUpdate", (data) => {
  nextBtn.disabled = data.auctionComplete || false;
  if (data.auctionComplete) {
    adminStatus.textContent = "Auction complete.";
  } else if (data.currentPlayer) {
    adminStatus.textContent = `Current: ${data.currentPlayer.name}`;
  }
});

socket.on("auctionEnd", (data) => {
  if (data.history) renderHistory(data.history);
});

socket.on("soldPlayers", (list) => {
  if (list) renderHistory(list);
});

socket.on("auctionPaused", (data) => {
  pauseBtn.textContent = data.isPaused ? "Resume Auction" : "Pause Auction";
  adminStatus.textContent = data.isPaused ? "Auction paused." : "Auction in progress.";
});

startBtn.addEventListener("click", () => {
  socket.emit("admin:startAuction");
  nextBtn.disabled = false;
  pauseBtn.disabled = false;
  adminStatus.textContent = "Auction started.";
});

nextBtn.addEventListener("click", () => {
  socket.emit("admin:nextPlayer");
});

pauseBtn.addEventListener("click", () => {
  socket.emit("admin:pauseAuction");
});
