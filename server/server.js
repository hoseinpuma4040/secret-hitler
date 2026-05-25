const path = require("path");
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const game = require("./game");

const PORT = 3000;
const CLIENT_DIR = path.join(__dirname, "..", "client");
const MIN_PLAYERS = parseInt(process.env.MIN_PLAYERS || "5", 10);
const MAX_PLAYERS = 10;

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static(CLIENT_DIR));

/** @type {Map<string, object>} */
const rooms = new Map();

function createRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getPlayerList(room) {
  return [...room.players.values()];
}

function getPublicRoom(room) {
  return {
    id: room.id,
    hostId: room.hostId,
    players: getPlayerList(room),
    gameStarted: Boolean(room.game?.started),
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
  };
}

function emitAll(room) {
  game.broadcast(io, room);
}

function getRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return null;
  return rooms.get(roomId) || null;
}

function requirePresident(socket, room) {
  return room.game.presidentId === socket.id;
}

function getPrivateRoleInfo(room, playerId) {
  const role = room.game.roles[playerId];
  const teammates = [];

  if (role === "fascist") {
    for (const [id, playerRole] of Object.entries(room.game.roles)) {
      if (id !== playerId && (playerRole === "fascist" || playerRole === "hitler")) {
        teammates.push({ id, name: room.players.get(id).name });
      }
    }
  }

  return {
    role,
    title: role === "hitler" ? "Hitler" : role === "fascist" ? "Fascist" : "Liberal",
    description: game.ROLE_DESCRIPTIONS[role],
    teammates,
    playerCount: room.players.size,
  };
}

function sendPrivateRoles(room) {
  for (const playerId of room.players.keys()) {
    io.to(playerId).emit("yourRole", getPrivateRoleInfo(room, playerId));
  }
}

function startVotingPhase(room) {
  const g = room.game;
  g.votes = {};
  for (const id of g.alivePlayers) g.votes[id] = null;

  game.setPhase(room, "voting", game.VOTE_DURATION_MS, () => {
    game.finishVoting(room, io, emitAll);
  });
  emitAll(room);
}

io.on("connection", (socket) => {

  // ===== CREATE ROOM =====
  socket.on("createRoom", ({ playerName }, callback) => {
    const roomId = createRoomId();
    const room = {
      id: roomId,
      hostId: socket.id,
      players: new Map([[socket.id, {
        id: socket.id,
        name: playerName.trim() || "Player"
      }]]),
      game: null,
      phaseTimer: null,
    };

    rooms.set(roomId, room);
    socket.join(roomId);
    socket.data.roomId = roomId;

    callback?.({ ok: true, room: getPublicRoom(room) });
    io.to(roomId).emit("roomUpdated", getPublicRoom(room));
  });

  // ===== VOICE SIGNALING =====
  socket.on("voice-offer", ({ targetId, offer }) => {
    io.to(targetId).emit("voice-offer", {
      from: socket.id,
      offer,
    });
  });

  socket.on("voice-answer", ({ targetId, answer }) => {
    io.to(targetId).emit("voice-answer", {
      from: socket.id,
      answer,
    });
  });

  socket.on("voice-candidate", ({ targetId, candidate }) => {
    io.to(targetId).emit("voice-candidate", {
      from: socket.id,
      candidate,
    });
  });

  socket.on("joinRoom", ({ roomId, playerName }, callback) => {
    const room = rooms.get(roomId?.toUpperCase());

    if (!room) {
      callback?.({ ok: false, error: "Room not found" });
      return;
    }

    if (room.game?.started) {
      callback?.({ ok: false, error: "Game already in progress" });
      return;
    }

    if (room.players.size >= MAX_PLAYERS) {
      callback?.({ ok: false, error: "Room is full" });
      return;
    }

    room.players.set(socket.id, {
      id: socket.id,
      name: playerName.trim() || "Player",
    });

    socket.join(room.id);
    socket.data.roomId = room.id;

    callback?.({ ok: true, room: getPublicRoom(room) });
    io.to(room.id).emit("roomUpdated", getPublicRoom(room));
  });

  socket.on("requestGameState", (_, callback) => {
    const room = getRoom(socket);
    if (!room?.game?.started) {
      callback?.({ ok: false, error: "No active game" });
      return;
    }
    io.to(socket.id).emit("gameState", game.getPublicGameState(room));
    io.to(socket.id).emit("privateState", game.getPrivateState(room, socket.id));
    callback?.({ ok: true });
  });

  socket.on("startGame", (callback) => {
    const room = getRoom(socket);

    if (!room) {
      callback?.({ ok: false, error: "Not in a room" });
      return;
    }

    if (room.hostId !== socket.id) {
      callback?.({ ok: false, error: "Only the host can start the game" });
      return;
    }

    if (room.game?.started) {
      callback?.({ ok: false, error: "Game already started" });
      return;
    }

    const count = room.players.size;
    if (count < MIN_PLAYERS || count > MAX_PLAYERS) {
      callback?.({
        ok: false,
        error: `Need ${MIN_PLAYERS}–${MAX_PLAYERS} players to start (currently ${count})`,
      });
      return;
    }

    game.createInitialGame(room);
    game.beginRound(room, io, emitAll);
    sendPrivateRoles(room);
    emitAll(room);

    callback?.({ ok: true });
  });

  socket.on("nominateChancellor", ({ targetId }, callback) => {
    const room = getRoom(socket);
    if (!room?.game || room.game.phase !== "nomination") {
      callback?.({ ok: false, error: "Cannot nominate now" });
      return;
    }
    if (!requirePresident(socket, room)) {
      callback?.({ ok: false, error: "Only the President can nominate" });
      return;
    }

    const eligible = game.getEligibleChancellors(room);
    if (!eligible.includes(targetId)) {
      callback?.({ ok: false, error: "Invalid Chancellor choice" });
      return;
    }

    room.game.chancellorNomineeId = targetId;
    startVotingPhase(room);
    callback?.({ ok: true });
  });

  socket.on("castVote", ({ vote }, callback) => {
    const room = getRoom(socket);
    if (!room?.game || room.game.phase !== "voting") {
      callback?.({ ok: false, error: "Not voting" });
      return;
    }

    if (!room.game.alivePlayers.includes(socket.id)) {
      callback?.({ ok: false, error: "You cannot vote" });
      return;
    }

    if (vote !== "ja" && vote !== "nein") {
      callback?.({ ok: false, error: "Invalid vote" });
      return;
    }

    room.game.votes[socket.id] = vote;
    emitAll(room);
    callback?.({ ok: true });
  });

  socket.on("presidentDiscard", ({ cardIndex }, callback) => {
    const room = getRoom(socket);
    const g = room?.game;
    if (!g || g.phase !== "legislative_president" || !requirePresident(socket, room)) {
      callback?.({ ok: false, error: "Cannot discard now" });
      return;
    }

    if (cardIndex < 0 || cardIndex >= g.legislativeCards.length) {
      callback?.({ ok: false, error: "Invalid card" });
      return;
    }

    const presidentHand = [...g.legislativeCards];
    const remaining = g.legislativeCards.filter((_, i) => i !== cardIndex);
    g.discardPile.push(g.legislativeCards[cardIndex]);
    g.chancellorPolicies = remaining;
    g.legislativeCards = remaining;
    g.currentSession = {
      presidentId: g.presidentId,
      chancellorId: g.chancellorNomineeId,
      presidentHand,
      chancellorHand: [...remaining],
    };
    game.setPhase(room, "legislative_chancellor", null, null);
    emitAll(room);
    callback?.({ ok: true });
  });

  socket.on("chancellorEnact", ({ cardIndex }, callback) => {
    const room = getRoom(socket);
    const g = room?.game;
    if (!g || g.phase !== "legislative_chancellor" || g.chancellorNomineeId !== socket.id) {
      callback?.({ ok: false, error: "Cannot enact now" });
      return;
    }

    if (cardIndex < 0 || cardIndex >= g.chancellorPolicies.length) {
      callback?.({ ok: false, error: "Invalid card" });
      return;
    }

    const enacted = g.chancellorPolicies[cardIndex];
    g.discardPile.push(...g.chancellorPolicies.filter((_, i) => i !== cardIndex));
    game.resolveLegislative(room, io, emitAll, enacted);
    callback?.({ ok: true });
  });

  socket.on("investigatePick", ({ targetId }, callback) => {
    const room = getRoom(socket);
    const g = room?.game;
    if (!g || g.phase !== "investigate_pick" || !requirePresident(socket, room)) {
      callback?.({ ok: false, error: "Cannot investigate now" });
      return;
    }
    if (!g.alivePlayers.includes(targetId) || targetId === socket.id) {
      callback?.({ ok: false, error: "Invalid target" });
      return;
    }

    const trueParty = game.getInvestigationParty(room, targetId);
    g.investigateTargetId = targetId;
    g.investigatePrivate = {
      [socket.id]: {
        targetId,
        targetName: room.players.get(targetId).name,
        trueParty,
      },
    };
    game.setPhase(room, "investigate_announce", null, null);
    emitAll(room);
    callback?.({ ok: true });
  });

  socket.on("announceInvestigation", ({ party }, callback) => {
    const room = getRoom(socket);
    const g = room?.game;
    if (!g || g.phase !== "investigate_announce" || !requirePresident(socket, room)) {
      callback?.({ ok: false, error: "Cannot announce now" });
      return;
    }
    if (party !== "liberal" && party !== "fascist") {
      callback?.({ ok: false, error: "Invalid announcement" });
      return;
    }

    const target = room.players.get(g.investigateTargetId);
    g.lastInvestigationAnnouncement = {
      targetName: target?.name || "Unknown",
      party,
      presidentName: room.players.get(socket.id)?.name,
    };
    g.investigatePrivate = {};
    g.investigateTargetId = null;
    game.startNominationPhase(room, io, emitAll);
    callback?.({ ok: true });
  });

  socket.on("submitChancellorClaim", ({ cards }, callback) => {
    const room = getRoom(socket);
    const g = room?.game;
    if (!g || g.phase !== "chancellor_claim" || g.currentSession?.chancellorId !== socket.id) {
      callback?.({ ok: false, error: "Cannot claim now" });
      return;
    }
    if (!Array.isArray(cards) || cards.length !== 2) {
      callback?.({ ok: false, error: "Pick exactly 2 cards" });
      return;
    }
    if (!cards.every((c) => c === "liberal" || c === "fascist")) {
      callback?.({ ok: false, error: "Invalid card type" });
      return;
    }

    g.publicClaims[g.currentSession.chancellorId] = {
      cards: [...cards],
      label: cards.map((c) => (c === "liberal" ? "L" : "F")).join(" + "),
    };
    game.setPhase(room, "president_claim", null, null);
    emitAll(room);
    callback?.({ ok: true });
  });

  socket.on("submitPresidentClaim", ({ cards }, callback) => {
    const room = getRoom(socket);
    const g = room?.game;
    if (!g || g.phase !== "president_claim" || g.currentSession?.presidentId !== socket.id) {
      callback?.({ ok: false, error: "Cannot claim now" });
      return;
    }
    if (!Array.isArray(cards) || cards.length !== 3) {
      callback?.({ ok: false, error: "Pick exactly 3 cards" });
      return;
    }
    if (!cards.every((c) => c === "liberal" || c === "fascist")) {
      callback?.({ ok: false, error: "Invalid card type" });
      return;
    }

    g.publicClaims[g.currentSession.presidentId] = {
      cards: [...cards],
      label: cards.map((c) => (c === "liberal" ? "L" : "F")).join(" + "),
    };
    g.currentSession = null;
    game.afterCardClaims(room, io, emitAll);
    callback?.({ ok: true });
  });

  socket.on("pickSpecialPresident", ({ targetId }, callback) => {
    const room = getRoom(socket);
    const g = room?.game;
    if (!g || g.phase !== "special_election" || !requirePresident(socket, room)) {
      callback?.({ ok: false, error: "Cannot pick now" });
      return;
    }
    if (!g.alivePlayers.includes(targetId)) {
      callback?.({ ok: false, error: "Invalid player" });
      return;
    }
    if (targetId === socket.id) {  callback?.({ ok: false, error: "Cannot pick yourself" });  return;}

    if (targetId === g.chancellorNomineeId) {  callback?.({ ok: false, error: "Cannot pick current chancellor" });  return;}

    g.nextSpecialPresidentId = targetId;
    game.startDiscussionPhase(room, io, emitAll);
    callback?.({ ok: true });
  });

  socket.on("executePlayer", ({ targetId }, callback) => {
    const room = getRoom(socket);
    const g = room?.game;
    if (!g || g.phase !== "execution" || !requirePresident(socket, room)) {
      callback?.({ ok: false, error: "Cannot execute now" });
      return;
    }
    if (!g.alivePlayers.includes(targetId) || targetId === socket.id) {
      callback?.({ ok: false, error: "Invalid target" });
      return;
    }

    g.alivePlayers = g.alivePlayers.filter((id) => id !== targetId);
    if (g.roles[targetId] === "hitler") {
      game.endGame(room, { winner: "liberal", reason: "Hitler اعدام شد" });
      emitAll(room);
      callback?.({ ok: true });
      return;
    }

    if (g.chancellorNomineeId === targetId) g.chancellorNomineeId = null;
    if (g.presidentId === targetId) g.presidentId = g.alivePlayers[0] || null;

    game.afterDiscussion(room, io, emitAll);
    callback?.({ ok: true });
  });

  socket.on("discussionPass", (_, callback) => {
    const room = getRoom(socket);
    const g = room?.game;
    if (!g || g.phase !== "discussion") {
      callback?.({ ok: false, error: "Not in discussion" });
      return;
    }

    if (g.discussion?.speakerId !== socket.id) {
      callback?.({ ok: false, error: "Not your turn" });
      return;
    }

    game.clearPhaseTimer(room);
    game.advanceDiscussionSpeaker(room, io, emitAll);
    callback?.({ ok: true });
  });

  socket.on("sendReaction", ({ emoji }, callback) => {
    const room = getRoom(socket);
    if (!room?.game) {
      callback?.({ ok: false });
      return;
    }

    const allowed = ["👍", "🤨", "😳", "❌"];
    if (!allowed.includes(emoji)) {
      callback?.({ ok: false, error: "Invalid reaction" });
      return;
    }

    const player = room.players.get(socket.id);
    room.game.reactions.push({
      emoji,
      playerId: socket.id,
      playerName: player?.name || "Player",
      at: Date.now(),
    });
    if (room.game.reactions.length > 20) {
      room.game.reactions = room.game.reactions.slice(-20);
    }

    emitAll(room);
    callback?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    game.clearPhaseTimer(room);
    room.players.delete(socket.id);

    if (room.players.size === 0) {
      rooms.delete(roomId);
      return;
    }

    if (room.hostId === socket.id) {
      room.hostId = room.players.keys().next().value;
    }

    if (room.game?.started) {
      room.game.alivePlayers = room.game.alivePlayers.filter((id) => room.players.has(id));
      delete room.game.roles[socket.id];
      room.game.playerOrder = room.game.playerOrder.filter((id) => room.players.has(id));

      if (room.game.presidentId === socket.id) {
        room.game.presidentId = room.game.alivePlayers[0] || null;
      }
      if (room.game.chancellorNomineeId === socket.id) {
        room.game.chancellorNomineeId = null;
      }

      emitAll(room);
      return;
    }

    io.to(roomId).emit("roomUpdated", getPublicRoom(room));
  });
  
    socket.on("restartGame", (_, callback) => {
  console.log("RESTART GAME TRIGGERED");
  const room = getRoom(socket);

  if (!room) {
    callback?.({ ok: false, error: "Not in a room" });
    return;
  }

  // فقط host بتونه ریست کنه
  if (room.hostId !== socket.id) {
    callback?.({ ok: false, error: "Only host can restart" });
    return;
  }

  // ریست کامل game
  room.game = null;

  // broadcast وضعیت جدید روم
  io.to(room.id).emit("roomUpdated", getPublicRoom(room));

  callback?.({ ok: true });
});
});

server.listen(PORT, () => {
  console.log("Server running");
  console.log(`Min players to start: ${MIN_PLAYERS}`);
});
