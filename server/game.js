const LIBERAL_POLICIES_WIN = 5;
const FASCIST_POLICIES_WIN = 6;
const HITLER_CHANCELLOR_MIN_FASCIST = 3;
const VOTE_DURATION_MS = 10000;
const VOTE_REVEAL_MS = 4000;
const DISCUSSION_TURN_MS = 30000;

/** Slot powers when that fascist policy # is enacted (index = count - 1) */
const FASCIST_TRACK_POWERS = [
  null,
  "investigate",
  "special_election",
  "execution",
  "execution",
  null,
];

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildPolicyDeck() {
  const deck = [];
  for (let i = 0; i < 6; i++) deck.push("liberal");
  for (let i = 0; i < 11; i++) deck.push("fascist");
  return shuffle(deck);
}

function getFascistTrackPowers() {
  return [...FASCIST_TRACK_POWERS];
}

function getAliveOrder(game) {
  return game.playerOrder.filter((id) => game.alivePlayers.includes(id));
}

function getPresidentIndex(game, presidentId) {
  return getAliveOrder(game).indexOf(presidentId);
}

function getNextPresidentAfter(game, playerId) {
  const order = getAliveOrder(game);
  const idx = order.indexOf(playerId);
  if (idx < 0) return order[0] || null;
  return order[(idx + 1) % order.length];
}

function advancePresident(game) {
  game.presidentId = getNextPresidentAfter(game, game.presidentId);
}

function clearPhaseTimer(room) {
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
}

function setPhase(room, phase, durationMs, onEnd) {
  const game = room.game;
  game.phase = phase;
  game.phaseEndsAt = durationMs ? Date.now() + durationMs : null;
  clearPhaseTimer(room);
  if (durationMs && onEnd) {
    room.phaseTimer = setTimeout(() => {
      room.phaseTimer = null;
      onEnd(room);
    }, durationMs);
  }
}

function drawPolicies(game, count) {
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (!game.policyDeck.length) {
      game.policyDeck = shuffle([...game.discardPile]);
      game.discardPile = [];
    }
    if (game.policyDeck.length) drawn.push(game.policyDeck.pop());
  }
  return drawn;
}

function getInvestigationParty(room, targetId) {
  const role = room.game.roles[targetId];
  return role === "liberal" ? "liberal" : "fascist";
}

function checkWin(room) {
  const game = room.game;
  if (game.liberalPolicies >= LIBERAL_POLICIES_WIN) {
    return { winner: "liberal", reason: "۵ سیاست لیبرال تصویب شد" };
  }
  if (game.fascistPolicies >= FASCIST_POLICIES_WIN) {
    return { winner: "fascist", reason: "۶ سیاست فاشیست تصویب شد" };
  }
  return null;
}

function hitlerChancellorWin(room) {
  const game = room.game;
  if (game.fascistPolicies < HITLER_CHANCELLOR_MIN_FASCIST) return null;
  const nominee = game.chancellorNomineeId;
  if (nominee && game.roles[nominee] === "hitler") {
    return { winner: "fascist", reason: "Hitler به عنوان صدراعظم انتخاب شد" };
  }
  return null;
}

function endGame(room, result) {
  clearPhaseTimer(room);
  room.game.phase = "game_over";
  room.game.phaseEndsAt = null;
  room.game.winner = result.winner;
  room.game.winReason = result.reason;
}

function getEligibleChancellors(room) {
  const game = room.game;
  return game.alivePlayers.filter(
    (id) =>
      id !== game.presidentId &&
      id !== game.lastPresidentId &&
      id !== game.lastChancellorId
  );
  if (game.inSpecialPresidentRound && id === game.anchorPresidentId) {
  return false;
}
}

function getPublicGameState(room) {
  const game = room.game;
  const voteReveal = game.phase === "vote_reveal";
  const players = [...room.players.values()].map((player) => ({
    id: player.id,
    name: player.name,
    alive: game.alivePlayers.includes(player.id),
    cardClaim: game.publicClaims?.[player.id] || null,
    vote: voteReveal ? game.votes?.[player.id] || null : null,
  }));

  const votes = voteReveal ? game.votes : null;
  const voteCounts =
    voteReveal && votes
      ? {
          ja: Object.values(votes).filter((v) => v === "ja").length,
          nein: Object.values(votes).filter((v) => v === "nein").length,
        }
      : null;

  return {
    roomId: room.id,
    hostId: room.hostId,
    started: game.started,
    phase: game.phase,
    phaseEndsAt: game.phaseEndsAt,
    round: game.round,
    playerCount: room.players.size,
    liberalPolicies: game.liberalPolicies,
    fascistPolicies: game.fascistPolicies,
    fascistTrackPowers: game.fascistTrackPowers,
    presidentId: game.presidentId,
    chancellorNomineeId: game.chancellorNomineeId,
    lastPresidentId: game.lastPresidentId,
    lastChancellorId: game.lastChancellorId,
    electionTracker: game.electionTracker,
    eligibleChancellors:
      game.phase === "nomination" || game.phase === "investigate_pick"
        ? getEligibleChancellors(room)
        : [],
    investigateTargets:
      game.phase === "investigate_pick" ? game.alivePlayers.filter((id) => id !== game.presidentId) : [],
    lastInvestigationAnnouncement: game.lastInvestigationAnnouncement,
    inSpecialPresidentRound: game.inSpecialPresidentRound,
    votes,
    voteCounts,
    votePassed: voteReveal ? game.lastVotePassed : null,
    governmentFormed:
      Boolean(game.chancellorNomineeId) &&
      [
        "legislative_president",
        "legislative_chancellor",
        "chancellor_claim",
        "president_claim",
        "discussion",
        "special_election",
        "execution",
      ].includes(game.phase),
    discussionSpeakerId: game.discussion?.speakerId || null,
    reactions: game.reactions.slice(-8),
    winner: game.winner,
    winReason: game.winReason,
    players,
  };
}

function getPrivateState(room, playerId) {
  const game = room.game;
  const role = game.roles[playerId];
  const priv = {
    roleReminder: role
      ? { role, label: role === "hitler" ? "Hitler" : role === "fascist" ? "Fascist" : "Liberal" }
      : null,
    cards: null,
    investigation: null,
    investigationResult: null,
  };

  if (game.phase === "legislative_president" && game.presidentId === playerId) {
    priv.cards = game.legislativeCards;
  }
  if (game.phase === "legislative_chancellor" && game.chancellorNomineeId === playerId) {
    priv.cards = game.chancellorPolicies;
  }
  if (game.investigatePrivate?.[playerId]) {
    priv.investigationResult = game.investigatePrivate[playerId];
  }

  if (game.phase === "chancellor_claim" && game.currentSession?.chancellorId === playerId) {
    priv.cards = game.currentSession.chancellorHand;
  }
  if (game.phase === "president_claim" && game.currentSession?.presidentId === playerId) {
    priv.cards = game.currentSession.presidentHand;
  }

  return priv;
}

function broadcast(io, room) {
  io.to(room.id).emit("gameState", getPublicGameState(room));
  for (const playerId of room.players.keys()) {
    io.to(playerId).emit("privateState", getPrivateState(room, playerId));
  }
}

function startNominationPhase(room, io, emitState) {
  const game = room.game;
  game.chancellorNomineeId = null;
  game.votes = {};
  game.lastVotePassed = null;
  setPhase(room, "nomination", null, null);
  emitState(room);
}

function startInvestigatePhase(room, io, emitState) {
  const game = room.game;
  game.investigatePrivate = {};
  game.investigateTargetId = null;
  setPhase(room, "investigate_pick", null, null);
  emitState(room);
}

function resolveDefaultJaVotes(game) {
  for (const id of game.alivePlayers) {
    if (game.votes[id] !== "nein") {
      game.votes[id] = "ja";
    }
  }
}

function countVoteResult(game) {
  let ja = 0;
  let nein = 0;
  for (const id of game.alivePlayers) {
    if (game.votes[id] === "nein") nein += 1;
    else ja += 1;
  }
  return { ja, nein, passed: ja >= nein };
}

function formGovernment(room, io, emitState) {
  const game = room.game;
  const hitlerWin = hitlerChancellorWin(room);
  if (hitlerWin) {
    endGame(room, hitlerWin);
    emitState(room);
    return;
  }
  game.electionTracker = 0;
  game.lastVotePassed = true;
  beginLegislative(room, io, emitState);
}

function beginRound(room, io, emitState) {
  const game = room.game;
  game.publicClaims = {};
  game.currentSession = null;

  if (game.nextSpecialPresidentId) {
    game.presidentId = game.nextSpecialPresidentId;
    game.nextSpecialPresidentId = null;
    game.inSpecialPresidentRound = true;
  }

  if (game.fascistPolicies === 2) {
    startInvestigatePhase(room, io, emitState);
    return;
  }

  startNominationPhase(room, io, emitState);
}

function afterDiscussion(room, io, emitState) {
  const game = room.game;

  if (game.pendingExecution) {
    game.pendingExecution = false;
    setPhase(room, "execution", null, null);
    emitState(room);
    return;
  }

  if (game.inSpecialPresidentRound) {
    game.inSpecialPresidentRound = false;
    game.presidentId = getNextPresidentAfter(game, game.anchorPresidentId);
  } else {
    advancePresident(game);
  }

  game.round += 1;
  beginRound(room, io, emitState);
}

function endDiscussionRound(room, io, emitState) {
  room.game.discussion = null;
  afterDiscussion(room, io, emitState);
}

function advanceDiscussionSpeaker(room, io, emitState) {
  const g = room.game;
  const d = g.discussion;
  if (!d) return;

  d.currentIndex += 1;
  if (d.currentIndex >= d.speakerOrder.length) {
    endDiscussionRound(room, io, emitState);
    return;
  }

  d.speakerId = d.speakerOrder[d.currentIndex];
  setPhase(room, "discussion", DISCUSSION_TURN_MS, () =>
    advanceDiscussionSpeaker(room, io, emitState)
  );
  emitState(room);
}

function startDiscussionPhase(room, io, emitState) {
  const g = room.game;
  const order = getAliveOrder(g);
  const startIdx = getPresidentIndex(g, g.presidentId);
  const speakerOrder = [];
  for (let i = 1; i <= order.length; i++) {
    speakerOrder.push(order[(startIdx + i) % order.length]);
  }

  g.discussion = { speakerOrder, currentIndex: 0, speakerId: speakerOrder[0] };
  g.reactions = [];

  setPhase(room, "discussion", DISCUSSION_TURN_MS, () =>
    advanceDiscussionSpeaker(room, io, emitState)
  );
  emitState(room);
}

function startChancellorClaimPhase(room, io, emitState) {
  setPhase(room, "chancellor_claim", null, null);
  emitState(room);
}

function afterCardClaims(room, io, emitState) {
  const game = room.game;

  if (game.needsSpecialElectionPick) {
    game.needsSpecialElectionPick = false;
    game.anchorPresidentId = game.presidentId;
    setPhase(room, "special_election", null, null);
    emitState(room);
    return;
  }

  startDiscussionPhase(room, io, emitState);
}

function postLegislativeFlow(room, io, emitState) {
  const game = room.game;
  game.lastPresidentId = game.presidentId;
  game.lastChancellorId = game.chancellorNomineeId;

  if (!game.currentSession) {
    afterCardClaims(room, io, emitState);
    return;
  }

  startChancellorClaimPhase(room, io, emitState);
}

function resolveLegislative(room, io, emitState, enactedPolicy) {
  const game = room.game;
  const discarded = game.legislativeCards.filter((c) => c !== enactedPolicy);
  game.discardPile.push(...discarded, ...game.chancellorPolicies.filter((c) => c !== enactedPolicy));
  game.legislativeCards = [];
  game.chancellorPolicies = [];

  if (enactedPolicy === "liberal") {
    game.liberalPolicies += 1;
  } else {
    game.fascistPolicies += 1;
    const count = game.fascistPolicies;
    if (count === 2) {
  startInvestigatePhase(room, io, emitState);
  return;
}

    if (count === 3) game.needsSpecialElectionPick = true;
    if (count === 4 || count === 5) game.pendingExecution = true;
  }

  const win = checkWin(room);
  if (win) {
    endGame(room, win);
    emitState(room);
    return;
  }

  postLegislativeFlow(room, io, emitState);
}

function enactTopPolicy(room, io, emitState) {
  const game = room.game;
  const [policy] = drawPolicies(game, 1);
  if (!policy) return;

  game.lastPresidentId = null;
  game.lastChancellorId = null;

  if (policy === "liberal") game.liberalPolicies += 1;
  else {
    game.fascistPolicies += 1;
    if (game.fascistPolicies === 3) game.needsSpecialElectionPick = true;
    if (game.fascistPolicies === 4 || game.fascistPolicies === 5) game.pendingExecution = true;
  }

  const win = checkWin(room);
  if (win) {
    endGame(room, win);
    emitState(room);
    return;
  }

  if (game.needsSpecialElectionPick || game.pendingExecution) {
    postLegislativeFlow(room, io, emitState);
  } else {
    advancePresident(game);
    beginRound(room, io, emitState);
  }
}

function finishVoting(room, io, emitState) {
  const game = room.game;
  resolveDefaultJaVotes(game);
  const { ja, nein, passed } = countVoteResult(game);
  game.lastVotePassed = passed;
  game.voteCounts = { ja, nein };

  if (passed) {
    setPhase(room, "vote_reveal", VOTE_REVEAL_MS, () => {
      formGovernment(room, io, emitState);
    });
    emitState(room);
    return;
  }

  setPhase(room, "vote_reveal", VOTE_REVEAL_MS, () => {
    game.electionTracker += 1;
    game.chancellorNomineeId = null;
    if (game.electionTracker >= 3) {
      game.electionTracker = 0;
      game.lastPresidentId = null;
      game.lastChancellorId = null;
      game.lastPresidentId = null;
game.lastChancellorId = null;
      enactTopPolicy(room, io, emitState);
    } else {
      advancePresident(game);
      beginRound(room, io, emitState);
    }
  });
  emitState(room);
}

function beginLegislative(room, io, emitState) {
  const game = room.game;
  game.legislativeCards = drawPolicies(game, 3);
  while (game.legislativeCards.length < 3) {
    game.legislativeCards.push(...drawPolicies(game, 3 - game.legislativeCards.length));
  }
  setPhase(room, "legislative_president", null, null);
  emitState(room);
}

function createInitialGame(room) {
  const playerIds = shuffle([...room.players.keys()]);
  const roleDeck = buildRoleDeck(playerIds.length);
  const roles = {};
  playerIds.forEach((id, i) => {
    roles[id] = roleDeck[i];
  });

  room.game = {
    started: true,
    phase: "nomination",
    phaseEndsAt: null,
    round: 1,
    roles,
    liberalPolicies: 0,
    fascistPolicies: 0,
    policyDeck: buildPolicyDeck(),
    discardPile: [],
    fascistTrackPowers: getFascistTrackPowers(),
    presidentId: playerIds[0],
    chancellorNomineeId: null,
    lastPresidentId: null,
    lastChancellorId: null,
    electionTracker: 0,
    alivePlayers: [...playerIds],
    playerOrder: playerIds,
    votes: {},
    legislativeCards: [],
    chancellorPolicies: [],
    needsSpecialElectionPick: false,
    pendingExecution: false,
    nextSpecialPresidentId: null,
    anchorPresidentId: null,
    inSpecialPresidentRound: false,
    investigatePrivate: {},
    investigateTargetId: null,
    currentSession: null,
    publicClaims: {},
    lastInvestigationAnnouncement: null,
    discussion: null,
    reactions: [],
    winner: null,
    winReason: null,
  };
}

const ROLE_COUNTS = {
  5: { liberal: 3, fascist: 1, hitler: 1 },
  6: { liberal: 4, fascist: 1, hitler: 1 },
  7: { liberal: 4, fascist: 2, hitler: 1 },
  8: { liberal: 5, fascist: 2, hitler: 1 },
  9: { liberal: 5, fascist: 3, hitler: 1 },
  10: { liberal: 6, fascist: 3, hitler: 1 },
};

function buildRoleDeck(playerCount) {
  const counts = ROLE_COUNTS[playerCount];
  const deck = [];
  for (let i = 0; i < counts.liberal; i++) deck.push("liberal");
  for (let i = 0; i < counts.fascist; i++) deck.push("fascist");
  for (let i = 0; i < counts.hitler; i++) deck.push("hitler");
  return shuffle(deck);
}

module.exports = {
  VOTE_DURATION_MS,
  VOTE_REVEAL_MS,
  DISCUSSION_TURN_MS,
  ROLE_DESCRIPTIONS: {
    liberal: "تیم شما باید ۵ سیاست لیبرال تصویب کند یا Hitler را اعدام کند.",
    fascist: "تیم شما باید ۶ سیاست فاشیست تصویب کند یا Hitler را بعد از ۳ فاشیست صدراعظم کند.",
    hitler: "شما مخفی هستید. اگر بعد از ۳ سیاست فاشیست صدراعظم شوید، تیم فاشیست می‌برد.",
  },
  buildRoleDeck,
  createInitialGame,
  getPublicGameState,
  getPrivateState,
  broadcast,
  clearPhaseTimer,
  setPhase,
  beginRound,
  startNominationPhase,
  startInvestigatePhase,
  startChancellorClaimPhase,
  afterCardClaims,
  startDiscussionPhase,
  advanceDiscussionSpeaker,
  finishVoting,
  formGovernment,
  resolveLegislative,
  enactTopPolicy,
  beginLegislative,
  endGame,
  getEligibleChancellors,
  getInvestigationParty,
  getNextPresidentAfter,
  afterDiscussion,
  shuffle,
};
