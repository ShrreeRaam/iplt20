const socket = io();

const btnCreateRoom = document.getElementById("btnCreateRoom");
const btnJoinRoom = document.getElementById("btnJoinRoom");
const joinRoomIdInput = document.getElementById("joinRoomId");
const lobbyError = document.getElementById("lobbyError");

btnCreateRoom.addEventListener("click", () => {
  socket.emit("createRoom");
});

btnJoinRoom.addEventListener("click", () => {
  const roomId = joinRoomIdInput.value.trim();
  if (roomId.length === 4) {
    socket.emit("joinRoom", { roomId });
  } else {
    lobbyError.textContent = "Enter a valid 4-digit Room ID";
  }
});

socket.on("roomCreated", ({ roomId }) => {
  // Store the roomId and role in sessionStorage for persistence
  sessionStorage.setItem("roomId", roomId);
  sessionStorage.setItem("role", "admin");
  window.location.href = `/admin.html?room=${roomId}`;
});

socket.on("joinAuction", (state) => {
  if (state.roomId) {
    sessionStorage.setItem("roomId", state.roomId);
    sessionStorage.setItem("role", "bidder");
    window.location.href = `/auction.html?room=${state.roomId}`;
  }
});

socket.on("error", (msg) => {
  lobbyError.textContent = msg;
});