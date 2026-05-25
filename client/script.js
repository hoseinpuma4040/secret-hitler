const socket = io();
window.__SH_SOCKET__ = socket;

const ROLE_REVEAL_MS = 10000;

const lobbyScreenEl = document.getElementById("lobbyScreen");
const lobbyFormEl = document.getElementById("lobbyForm");
const roomViewEl = document.getElementById("roomView");
const cardEl = document.querySelector(".card");
const roleRevealScreenEl = document.getElementById("roleRevealScreen");
const gameBoardScreenEl = document.getElementById("gameBoardScreen");

const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCode");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const statusEl = document.getElementById("status");

const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const copyRoomCodeBtn = document.getElementById("copyRoomCodeBtn");
const playerListEl = document.getElementById("playerList");
const playerCountEl = document.getElementById("playerCount");
const startGameBtn = document.getElementById("startGameBtn");
const startHintEl = document.getElementById("startHint");

const roleTitleEl = document.getElementById("roleTitle");
const roleDescriptionEl = document.getElementById("roleDescription");
const roleTeammatesEl = document.getElementById("roleTeammates");
const roleTimerEl = document.getElementById("roleTimer");

let currentRoom = null;
let pendingGameState = null;
let roleRevealTimeout = null;
let currentGameState = null;

function getPlayerName() {
  const name = playerNameInput.value.trim();
  if (!name) {
    setStatus("Enter your player name", "error");
    return null;
  }
  return name;
}

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = "status";
  if (type) statusEl.classList.add(type);
}

function setLobbyLocked(locked) {
  cardEl.classList.toggle("in-room", locked);
  playerNameInput.disabled = locked;
  roomCodeInput.disabled = locked;
  createRoomBtn.disabled = locked;
  joinRoomBtn.disabled = locked;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getPlayerNameById(state, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  return player ? player.name : "—";
}

function renderRoom(room) {
  //if (room.gameStarted) return;

  currentRoom = room;

  roomViewEl.classList.remove("hidden");
  setLobbyLocked(true);

  roomCodeDisplay.textContent = room.id;
  const minPlayers = room.minPlayers || 5;
  const maxPlayers = room.maxPlayers || 10;
  playerCountEl.textContent = `${room.players.length} / ${maxPlayers}`;

  const isHost = socket.id === room.hostId;
  const canStart = room.players.length >= minPlayers;
  const needed = Math.max(0, minPlayers - room.players.length);

  playerListEl.innerHTML = room.players
    .map((player) => {
      const isPlayerHost = player.id === room.hostId;
      const isYou = player.id === socket.id;
      const badges = [];

      if (isPlayerHost) badges.push('<span class="badge badge-host">Host</span>');
      if (isYou) badges.push('<span class="badge badge-you">You</span>');

      return `
        <li>
          <span class="name">${escapeHtml(player.name)}</span>
          <span class="badges">${badges.join("")}</span>
        </li>
      `;
    })
    .join("");

  startGameBtn.classList.toggle("hidden", !isHost);

  if (canStart) {
    startHintEl.textContent = "Ready to start!";
    startHintEl.classList.add("hint-ready");
  } else {
    startHintEl.textContent = `Need ${needed} more player${needed === 1 ? "" : "s"} (${minPlayers}–${maxPlayers} total)`;
    startHintEl.classList.remove("hint-ready");
  }
}

function handleRoomResponse(response) {
  if (!response?.ok) {
    setStatus(response?.error || "Something went wrong", "error");
    return;
  }

  if (response.room.gameStarted) return;

  setStatus("Joined room", "success");
  renderRoom(response.room);
}

function hideLobby() {
  lobbyScreenEl.classList.add("hidden");
}

function showRoleReveal(roleInfo) {
  hideLobby();
  roleRevealScreenEl.classList.remove("hidden");
  gameBoardScreenEl.classList.add("hidden");

  const roleClass =
    roleInfo.role === "liberal"
      ? "role-liberal"
      : roleInfo.role === "fascist"
        ? "role-fascist"
        : "role-hitler";

  roleRevealScreenEl.classList.remove("hidden", "role-liberal", "role-fascist", "role-hitler");
  roleRevealScreenEl.classList.add(roleClass);

  if (roleInfo.role === "liberal") {
    roleTitleEl.textContent = "You are a Liberal.";
  } else if (roleInfo.role === "fascist") {
    roleTitleEl.textContent = "You are a Fascist.";
  } else {
    roleTitleEl.textContent = "You are Hitler.";
  }

  roleDescriptionEl.textContent = roleInfo.description;

  if (roleInfo.teammates.length > 0) {
    roleTeammatesEl.classList.remove("hidden");
    const label = roleInfo.role === "fascist" ? "Hitler & Fascists" : "Your team";
    roleTeammatesEl.innerHTML = `
      <p class="teammates-label">${label}</p>
      <ul class="teammates-list">
        ${roleInfo.teammates
          .map((t) => `<li>${escapeHtml(t.name)}</li>`)
          .join("")}
      </ul>
    `;
  } else {
    roleTeammatesEl.classList.add("hidden");
    roleTeammatesEl.innerHTML = "";
  }

  let secondsLeft = ROLE_REVEAL_MS / 1000;
  roleTimerEl.textContent = `Continuing in ${secondsLeft}…`;

  clearInterval(roleRevealScreenEl._timerInterval);
  roleRevealScreenEl._timerInterval = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft > 0) {
      roleTimerEl.textContent = `Continuing in ${secondsLeft}…`;
    }
  }, 1000);

  clearTimeout(roleRevealTimeout);
  roleRevealTimeout = setTimeout(finishRoleReveal, ROLE_REVEAL_MS);
}

function finishRoleReveal() {
  clearInterval(roleRevealScreenEl._timerInterval);
  roleRevealScreenEl.classList.add("hidden");

  const state = pendingGameState || currentGameState;
  if (state) {
    showGameBoard(state);
    pendingGameState = null;
    return;
  }

  gameBoardScreenEl.classList.remove("hidden");
  hideLobby();
  const prompt = document.getElementById("actionPrompt");
  if (prompt) prompt.textContent = "Syncing game…";
  socket.emit("requestGameState");
}

function showGameBoard(state) {
  if (!state) return;
  currentGameState = state;
  window.currentGameState = state;
  hideLobby();
  roleRevealScreenEl.classList.add("hidden");
  gameBoardScreenEl.classList.remove("hidden");

  if (typeof window.renderGameBoard === "function") {
    try {
      window.renderGameBoard(state);
    } catch (err) {
      console.error("renderGameBoard failed:", err);
      const prompt = document.getElementById("actionPrompt");
      if (prompt) prompt.textContent = "UI error — refresh the page";
    }
  } else {
    const prompt = document.getElementById("actionPrompt");
    if (prompt) prompt.textContent = "Loading game UI…";
  }
}

createRoomBtn.addEventListener("click", () => {
  const playerName = getPlayerName();
  if (!playerName) return;

  setStatus("Creating room…");
  socket.emit("createRoom", { playerName }, handleRoomResponse);
});

joinRoomBtn.addEventListener("click", () => {
  const playerName = getPlayerName();
  if (!playerName) return;

  const roomId = roomCodeInput.value.trim().toUpperCase();
  if (!roomId) {
    setStatus("Enter a room code", "error");
    roomCodeInput.focus();
    return;
  }

  setStatus("Joining room…");
  socket.emit("joinRoom", { roomId, playerName }, handleRoomResponse);
});

copyRoomCodeBtn.addEventListener("click", async () => {
  if (!currentRoom) return;

  try {
    await navigator.clipboard.writeText(currentRoom.id);
    setStatus("Room code copied", "success");
  } catch {
    setStatus("Could not copy code", "error");
  }
});

startGameBtn.addEventListener("click", () => {
  const minPlayers = currentRoom?.minPlayers || 5;
  if (!currentRoom || currentRoom.players.length < minPlayers) {
    setStatus(`Need at least ${minPlayers} players in the room`, "error");
    return;
  }

  setStatus("Starting game…");
  startGameBtn.disabled = true;

  const timeout = setTimeout(() => {
    setStatus("No response from server — is it running?", "error");
    startGameBtn.disabled = false;
  }, 8000);

  socket.emit("startGame", (response) => {
    clearTimeout(timeout);

    if (!response?.ok) {
      setStatus(response?.error || "Could not start game", "error");
      startGameBtn.disabled = false;
      return;
    }

    setStatus("Game starting…", "success");
  });
});

socket.on("roomUpdated", (room) => {

  if (!room.gameStarted) {

    window.voiceInitialized = false;

    if (typeof peers !== "undefined" && peers) {
      Object.values(peers).forEach(pc => {
        try {
          pc.close();
        } catch (e) {}
      });

      peers = {};
    }

    window.winPlayed = false;

    if (typeof localStream !== "undefined" && localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
  }

  renderRoom(room);
});

socket.on("yourRole", (roleInfo) => {
  showRoleReveal(roleInfo);
});

socket.on("gameState", (state) => {
  if (!state?.phase) return;
  currentGameState = state;
  window.currentGameState = state;

  if (roleRevealScreenEl.classList.contains("hidden")) {
    showGameBoard(state);
  } else {
    pendingGameState = state;
  }
});

socket.on("connect_error", () => {
  setStatus("Could not connect to server", "error");
});

if (typeof window.initGameClient === "function") {
  window.initGameClient(socket);
}
