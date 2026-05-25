(function () {
  const LIBERAL_SLOTS = 5;
  const FASCIST_SLOTS = 6;

  const boardRoomCodeEl = document.getElementById("boardRoomCode");
  const boardRoundEl = document.getElementById("boardRound");
  const liberalTrackEl = document.getElementById("liberalTrack");
  const fascistTrackEl = document.getElementById("fascistTrack");
  const electionTrackerEl = document.getElementById("electionTracker");
  const presidentNameEl = document.getElementById("presidentName");
  const chancellorNameEl = document.getElementById("chancellorName");
  const boardPlayerListEl = document.getElementById("boardPlayerList");

  let currentGameState = null;
  let localVote = null;
  let localStream = null;
  let peers = {};

const socket = getSocket();

socket.on("connect", () => {
  console.log("Reconnected ✅");

  socket.emit("requestGameState");
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    console.log("User came back ✅");

    socket.emit("requestGameState");
  }
});

socket.on("voice-offer", async ({ from, offer }) => {
  const stream = await initMic();
  if (!stream) return;

  const pc = createPeerConnection(from, stream);

  await pc.setRemoteDescription(offer);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("voice-answer", {
    targetId: from,
    answer,
  });
});

socket.on("voice-answer", async ({ from, answer }) => {
  const pc = peers[from];
  if (!pc) return;

  await pc.setRemoteDescription(answer);
});

socket.on("voice-ice", async ({ from, candidate }) => {
  const pc = peers[from];
  if (!pc) return;

  try {
    await pc.addIceCandidate(candidate);
  } catch (e) {}
});

  function createPeerConnection(targetId, stream) {

  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject"
      }
    ]
  });

  if (stream) {
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });
  }

  pc.ontrack = (event) => {
    let audio = document.getElementById("audio-" + targetId);

if (!audio) {
  audio = document.createElement("audio");
  audio.id = "audio-" + targetId;
  audio.autoplay = true;
  document.body.appendChild(audio);
}

audio.srcObject = event.streams[0];
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      getSocket()?.emit("voice-ice", {
        targetId,
        candidate: event.candidate
      });
    }
  };

  peers[targetId] = pc;

  return pc;
}


async function initMic() {
  if (localStream) return localStream;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return localStream;
  } catch (e) {
    alert("Microphone access denied");
    return null;
  }
}

  const POWER_LABELS = {
    investigate: "استعلام",
    execution: "اعدام",
    special_election: "رئیس‌جمهور انتخابی",
  };

  const PHASE_LABELS = {
    nomination: "Nomination",
    voting: "Voting",
    vote_reveal: "Vote results",
    legislative_president: "President discards",
    legislative_chancellor: "Chancellor enacts",
    investigate_pick: "Investigation",
    investigate_announce: "Announce investigation",
    chancellor_claim: "Chancellor card claim",
    president_claim: "President card claim",
    special_election: "Special election",
    execution: "Execution",
    discussion: "Discussion",
    game_over: "Game over",
  };

  const roleReminderEl = document.getElementById("roleReminder");
  const announcementBannerEl = document.getElementById("announcementBanner");

  const phaseBannerEl = document.getElementById("phaseBanner");
  const actionPromptEl = document.getElementById("actionPrompt");
  const actionButtonsEl = document.getElementById("actionButtons");
  const reactionBarEl = document.getElementById("reactionBar");
  const reactionsFeedEl = document.getElementById("reactionsFeed");
  const privateOverlayEl = document.getElementById("privateOverlay");
  const privateTitleEl = document.getElementById("privateTitle");
  const privateContentEl = document.getElementById("privateContent");
  const privateCloseBtn = document.getElementById("privateCloseBtn");
  const winOverlayEl = document.getElementById("winOverlay");
  const winTitleEl = document.getElementById("winTitle");
  const winReasonEl = document.getElementById("winReason");

  let phaseTimerInterval = null;
  let privateState = null;


  function playSound(name) {
  const audio = new Audio(`/sounds/${name}.mp3`);
  audio.volume = 0.5;

  audio.play().catch(() => {
  });
  }

  function getSocket() {
    return window.gameSocket || window.__SH_SOCKET__;
  }

  function getMyId() {
    return getSocket()?.id || null;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function getPlayerName(state, id) {
    const p = state.players.find((x) => x.id === id);
    return p ? p.name : "—";
  }

  function formatCountdown(endsAt) {
    if (!endsAt) return "";
    const sec = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    return `${sec}s`;
  }

  function buildTrackSlots(total, filled, filledClass, powers) {
    let html = "";
    for (let i = 0; i < total; i++) {
      const isFilled = i < filled;
      const power = powers && powers[i];
      const powerLabel = power ? POWER_LABELS[power] || power : "";
      html += `<div class="track-slot ${isFilled ? `filled ${filledClass}` : ""} ${power ? "has-power" : ""}" title="${powerLabel}">
        ${power && !isFilled ? `<span class="power-icon">${powerLabel.charAt(0)}</span>` : ""}
      </div>`;
    }
    return html;
  }

  function renderFascistTrack(state) {
    return buildTrackSlots(
      FASCIST_SLOTS,
      state.fascistPolicies,
      "slot-fascist",
      state.fascistTrackPowers
    );
  }

  function clearActionButtons() {
    actionButtonsEl.innerHTML = "";
  }

  function addButton(label, className, onClick) {
  const btn = document.createElement("button");

  btn.type = "button";
  btn.className = `btn ${className || "btn-secondary"}`;
  btn.textContent = label;

  btn.addEventListener("click", async () => {

    if (btn.disabled) return;

    playSound("click");

    btn.disabled = true;

    try {
      await onClick();
    } finally {
      setTimeout(() => {
        btn.disabled = false;
      }, 800);
    }
  });

  actionButtonsEl.appendChild(btn);
  return btn;
}

  function renderClaimBuilder(slotCount, emitEvent) {
    const selected = [];
    const preview = document.createElement("p");
    preview.className = "claim-preview";
    preview.textContent = "Selected: —";
    actionButtonsEl.appendChild(preview);

    const updatePreview = () => {
      preview.textContent =
        selected.length === 0
          ? "Selected: —"
          : `Selected: ${selected.map((c) => (c === "liberal" ? "Liberal" : "Fascist")).join(", ")}`;
    };

    addButton("+ Liberal", "btn-primary", () => {
      if (selected.length < slotCount) {
        selected.push("liberal");
        updatePreview();
      }
    });
    addButton("+ Fascist", "btn-nein", () => {
      if (selected.length < slotCount) {
        selected.push("fascist");
        updatePreview();
      }
    });
    addButton("Undo", "btn-secondary", () => {
      selected.pop();
      updatePreview();
    });
    addButton("Announce to everyone", "btn-primary", () => {
      if (selected.length !== slotCount) {
        actionPromptEl.textContent = `Pick exactly ${slotCount} cards`;
        return;
      }
      getSocket()?.emit(emitEvent, { cards: selected }, (res) => {
        if (!res?.ok) actionPromptEl.textContent = res?.error || "Failed";
      });
    });
  }

  function showPrivateModal(title, html, onClose) {
    privateTitleEl.textContent = title;
    privateContentEl.innerHTML = html;
    privateOverlayEl.classList.remove("hidden");
    privateCloseBtn.onclick = () => {
      privateOverlayEl.classList.add("hidden");
      onClose?.();
    };
  }

  function renderReactions(state) {
    if (!state.reactions?.length) {
      reactionsFeedEl.innerHTML = "";
      return;
    }
    reactionsFeedEl.innerHTML = state.reactions
      .map(
        (r) =>
          `<span class="reaction-chip">${r.emoji} ${escapeHtml(r.playerName)}</span>`
      )
      .join("");
  }

  function renderPrivateOverlay() {
    if (!privateState) return;

    if (privateState.investigationResult) {
      const inv = privateState.investigationResult;
      const partyLabel = inv.trueParty === "liberal" ? "Liberal" : "Fascist";
      showPrivateModal(
        "نتیجه واقعی (فقط تو می‌بینی)",
        `<p><strong>${escapeHtml(inv.targetName)}</strong></p>
         <p class="party-result">${partyLabel}</p>
         <p class="private-hint">حالا به همه اعلام کن — می‌توانی دروغ بگویی.</p>`,
        null
      );
      privateCloseBtn.classList.add("hidden");
      return;
    }

    if (privateState.cards?.length) {
      const isPresident = currentGameState?.phase === "legislative_president";
      showPrivateModal(
        isPresident ? "Discard one policy" : "Enact one policy",
        `<p class="private-hint">Tap a card:</p><div class="policy-cards">${privateState.cards
          .map(
            (c, i) =>
              `<button type="button" class="policy-card policy-${c}" data-idx="${i}">${c}</button>`
          )
          .join("")}</div>`,
        null
      );
      privateContentEl.querySelectorAll(".policy-card").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.dataset.idx, 10);
          privateOverlayEl.classList.add("hidden");
          if (isPresident) {
            getSocket()?.emit("presidentDiscard", { cardIndex: idx });
          } else {
            getSocket()?.emit("chancellorEnact", { cardIndex: idx });
          }
        });
      });
      privateCloseBtn.classList.add("hidden");
      return;
    }

    privateCloseBtn.classList.remove("hidden");
  }

  function renderActions(state) {
    clearActionButtons();
    const me = getMyId();
    const alive = state.players.find((p) => p.id === me)?.alive;

    reactionBarEl.classList.toggle("hidden", state.phase !== "discussion");

    if (state.phase === "game_over") {

  if (!window.winPlayed) {
    playSound("win");
    window.winPlayed = true;
  }

  actionPromptEl.textContent = state.winReason || "Game ended";

  if (state.hostId === me) {
    addButton("Restart Game", "btn-primary", () => {
      getSocket()?.emit("restartGame", {}, (res) => {
        if (!res?.ok) {
          alert(res?.error || "Restart failed");
        }
      });
    });
  }

  return;
}

    if (state.phase === "nomination" && state.presidentId === me) {
      actionPromptEl.textContent = "Choose a Chancellor nominee";
      state.eligibleChancellors.forEach((id) => {
        addButton(getPlayerName(state, id), "btn-primary", () => {
          getSocket()?.emit("nominateChancellor", { targetId: id }, (res) => {
            if (!res?.ok) actionPromptEl.textContent = res?.error || "Failed";
          });
        });
      });
      return;
    }

    if (state.phase === "nomination") {
      actionPromptEl.textContent = `Waiting for ${getPlayerName(state, state.presidentId)} to nominate`;
      return;
    }

    if (state.phase === "voting" && alive) {
      actionPromptEl.textContent = localVote
        ? `You voted ${localVote.toUpperCase()}`
        : "Cast your vote (no vote = JA after 15s)";
      if (!localVote) {
        addButton("JA", "btn-ja", () => vote("ja"));
        addButton("NEIN", "btn-nein", () => vote("nein"));
      }
      return;
    }

    if (state.phase === "voting") {
      actionPromptEl.textContent = "Voting in progress…";
      return;
    }

    if (state.phase === "vote_reveal") {
      const c = state.voteCounts;
      actionPromptEl.textContent = c
        ? `Ja ${c.ja} — Nein ${c.nein} — ${state.votePassed ? "Cabinet formed — legislation next" : "Government rejected"}`
        : "Revealing votes…";
      return;
    }

    if (state.governmentFormed) {
      if (state.phase === "legislative_president" && state.presidentId === me) {
        actionPromptEl.textContent = "Cabinet formed — view your 3 policies and discard one";
        addButton("View policies", "btn-primary", () => renderPrivateOverlay());
        return;
      }
      if (state.phase === "legislative_chancellor" && state.chancellorNomineeId === me) {
        actionPromptEl.textContent = "Cabinet formed — enact one policy";
        addButton("View policies", "btn-primary", () => renderPrivateOverlay());
        return;
      }
    }

    if (
      state.phase === "legislative_president" ||
      state.phase === "legislative_chancellor"
    ) {
      if (state.presidentId === me || state.chancellorNomineeId === me) {
        /* handled above when governmentFormed */
      } else {
        actionPromptEl.textContent = "Legislative session — cabinet is in power";
      }
      return;
    }

    if (state.phase === "investigate_pick" && state.presidentId === me) {
      actionPromptEl.textContent = "یک نفر را برای استعلام انتخاب کن";
      (state.investigateTargets || []).forEach((id) => {
        addButton(getPlayerName(state, id), "btn-primary", () => {
          getSocket()?.emit("investigatePick", { targetId: id }, (res) => {
            if (!res?.ok) actionPromptEl.textContent = res?.error || "Failed";
          });
        });
      });
      return;
    }

    if (state.phase === "investigate_pick") {
      actionPromptEl.textContent = `${getPlayerName(state, state.presidentId)} در حال استعلام است`;
      return;
    }

    if (state.phase === "investigate_announce" && state.presidentId === me) {
      const inv = privateState?.investigationResult;
      const trueLabel = inv
        ? `${inv.targetName} is really: ${inv.trueParty === "liberal" ? "Liberal" : "Fascist"}`
        : "Loading result…";
      actionPromptEl.textContent = `${trueLabel} — announce to all (you may lie):`;
      addButton("Announce: Liberal", "btn-primary", () => {
        getSocket()?.emit("announceInvestigation", { party: "liberal" }, (res) => {
          if (!res?.ok) actionPromptEl.textContent = res?.error || "Failed";
        });
      });
      addButton("Announce: Fascist", "btn-nein", () => {
        getSocket()?.emit("announceInvestigation", { party: "fascist" }, (res) => {
          if (!res?.ok) actionPromptEl.textContent = res?.error || "Failed";
        });
      });
      return;
    }

    if (state.phase === "investigate_announce") {
      actionPromptEl.textContent = "رئیس‌جمهور در حال اعلام نتیجه است";
      return;
    }

    if (state.phase === "chancellor_claim" && (state.lastChancellorId === me || state.chancellorNomineeId === me)) {
      actionPromptEl.textContent = "What 2 cards did you see? (everyone will see your claim)";
      if (privateState?.cards) {
        addButton("View your real cards", "btn-ghost", () => renderPrivateOverlay());
      }
      renderClaimBuilder(2, "submitChancellorClaim");
      return;
    }

    if (state.phase === "chancellor_claim") {
      const name = getPlayerName(state, state.lastChancellorId);
      actionPromptEl.textContent = `${name} is announcing the 2 cards they saw…`;
      return;
    }

    if (state.phase === "president_claim" && state.lastPresidentId === me) {
      actionPromptEl.textContent = "What 3 cards did you see? (everyone will see your claim)";
      if (privateState?.cards) {
        addButton("View your real cards", "btn-ghost", () => renderPrivateOverlay());
      }
      renderClaimBuilder(3, "submitPresidentClaim");
      return;
    }

    if (state.phase === "president_claim") {
      const name = getPlayerName(state, state.lastPresidentId);
      actionPromptEl.textContent = `${name} is announcing the 3 cards they saw…`;
      return;
    }

    if (state.phase === "special_election" && state.presidentId === me) {
      actionPromptEl.textContent = "رئیس‌جمهور دور بعد را انتخاب کن";
      state.players
        .filter((p) => p.alive)
        .forEach((p) => {
          addButton(p.name, "btn-primary", () => {
            getSocket()?.emit("pickSpecialPresident", { targetId: p.id });
          });
        });
      return;
    }

    if (state.phase === "special_election") {
      actionPromptEl.textContent = "انتخاب رئیس‌جمهور ویژه…";
      return;
    }

    if (state.phase === "execution" && state.presidentId === me) {
      actionPromptEl.textContent = "بعد از بحث: یک نفر را اعدام کن";
      state.players
        .filter((p) => p.alive && p.id !== me)
        .forEach((p) => {
          addButton(p.name, "btn-nein", () => {
            getSocket()?.emit("executePlayer", { targetId: p.id });
          });
        });
      return;
    }

    if (state.phase === "execution") {
      actionPromptEl.textContent = "رئیس‌جمهور در حال انتخاب اعدام است";
      return;
    }

  if (state.phase === "discussion") {
  const speaker = state.discussionSpeakerId;

  if (!window.voiceInitialized) {
    window.voiceInitialized = true;

    initMic().then(async (stream) => {
      if (!stream) return;

      const socket = getSocket();

      for (const p of currentGameState.players) {
        if (p.id === me) continue;

        if (peers[p.id]) continue;

        const pc = createPeerConnection(p.id, stream);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("voice-offer", {
          targetId: p.id,
          offer,
        });
      }
    });
  }

  if (speaker === me) {
    actionPromptEl.textContent = "Your turn to speak (Pass to skip)";
    addButton("Pass", "btn-secondary", () => getSocket()?.emit("discussionPass"));

    if (localStream) {
      localStream.getTracks().forEach(track => track.enabled = true);
    }

  } else {
    actionPromptEl.textContent = `${getPlayerName(state, speaker)} is speaking — listen & react`;

    if (localStream) {
      localStream.getTracks().forEach(track => track.enabled = false);
    }
  }

  return;
}

    actionPromptEl.textContent = state.phase
      ? `Phase: ${state.phase} — waiting for your turn`
      : "Connecting to game…";
  }

  function vote(choice) {
    playSound("vote");
    getSocket()?.emit("castVote", { vote: choice }, (res) => {
      if (!res?.ok) {
        actionPromptEl.textContent = res?.error || "Vote failed";
        return;
      }
      localVote = choice;
      if (currentGameState) renderActions(currentGameState);
    });
  }

  function updatePhaseBanner(state) {
    const label = PHASE_LABELS[state.phase] || state.phase;
    const timer = formatCountdown(state.phaseEndsAt);
    phaseBannerEl.textContent = timer ? `${label} · ${timer}` : label;

    clearInterval(phaseTimerInterval);
    if (state.phaseEndsAt) {
      phaseTimerInterval = setInterval(() => {
        phaseBannerEl.textContent = `${label} · ${formatCountdown(state.phaseEndsAt)}`;
      }, 500);
    }
  }

  function renderWin(state) {
    if (state.phase !== "game_over" || !state.winner) {
      winOverlayEl.classList.add("hidden");
      return;
    }
    winOverlayEl.classList.remove("hidden");
    winTitleEl.textContent =
      state.winner === "liberal" ? "Liberals win!" : "Fascists win!";
    winTitleEl.className = `win-title win-${state.winner}`;
    winReasonEl.textContent = state.winReason || "";
    // ⬇️ دکمه ریست
let restartBtn = document.getElementById("restartBtn");

if (!restartBtn) {
  restartBtn = document.createElement("button");
  restartBtn.id = "restartBtn";
  restartBtn.textContent = "Restart Game";
  restartBtn.className = "btn btn-primary";

  restartBtn.onclick = () => {
    getSocket()?.emit("restartGame", {}, (res) => {
      if (!res?.ok) {
        alert(res?.error || "Error restarting game");
      }
    });
  };

  winOverlayEl.appendChild(restartBtn);
}
  }

  window.renderGameBoard = function (state) {
    if (!state || !state.phase) return;
    currentGameState = state;
    if (state.phase !== "voting") localVote = null;

    boardRoomCodeEl.textContent = state.roomId;
    boardRoundEl.textContent = String(state.round);

    liberalTrackEl.innerHTML = buildTrackSlots(
      LIBERAL_SLOTS,
      state.liberalPolicies,
      "slot-liberal"
    );
    fascistTrackEl.innerHTML = renderFascistTrack(state);
    electionTrackerEl.textContent = String(state.electionTracker);

    presidentNameEl.textContent = state.presidentId
      ? getPlayerName(state, state.presidentId)
      : "—";
    chancellorNameEl.textContent = state.chancellorNomineeId
      ? getPlayerName(state, state.chancellorNomineeId)
      : "—";

    boardPlayerListEl.innerHTML = state.players
      .map((player) => {
        const classes = [];
        const badges = [];
        if (!player.alive) classes.push("dead");
        if (player.id === state.presidentId) classes.push("president");
        if (player.id === state.chancellorNomineeId) classes.push("chancellor");
        if (player.id === state.discussionSpeakerId) classes.push("speaking");
        if (player.id === state.hostId) badges.push('<span class="badge badge-host">Host</span>');
        if (player.id === getMyId()) badges.push('<span class="badge badge-you">You</span>');
        if (player.id === state.presidentId) {
          badges.push('<span class="badge badge-president">President</span>');
        }
        if (player.id === state.chancellorNomineeId) {
          badges.push('<span class="badge badge-chancellor">Nominee</span>');
        }
        if (player.id === state.discussionSpeakerId) {
          badges.push('<span class="badge badge-speaking">Speaking</span>');
        }
        if (player.cardClaim) {
          badges.push(
            `<span class="badge badge-claim" title="Claimed cards">🃏 ${escapeHtml(player.cardClaim.label)}</span>`
          );
        }

        return `
          <li class="${classes.join(" ")}">
            <span class="name">${escapeHtml(player.name)}</span>
            <span class="badges">${badges.join("")}</span>
          </li>
        `;
      })
      .join("");

    updatePhaseBanner(state);
    if (state.governmentFormed && state.chancellorNomineeId) {
      chancellorNameEl.textContent = getPlayerName(state, state.chancellorNomineeId);
    }
    updateAnnouncement(state);
    renderActions(state);
    renderReactions(state);
    renderWin(state);

    if (privateState?.roleReminder) updateRoleReminder(privateState);

    if (
      privateState?.cards &&
      (state.phase === "legislative_president" || state.phase === "legislative_chancellor")
    ) {
      const show =
        (state.phase === "legislative_president" && state.presidentId === getMyId()) ||
        (state.phase === "legislative_chancellor" &&
          state.chancellorNomineeId === getMyId());
      if (show && privateOverlayEl.classList.contains("hidden")) {
        renderPrivateOverlay();
      }
    }
  };

  function updateRoleReminder(priv) {
    if (!priv?.roleReminder) {
      roleReminderEl.classList.add("hidden");
      return;
    }
    roleReminderEl.classList.remove("hidden");
    roleReminderEl.textContent = `نقش شما: ${priv.roleReminder.label}`;
    roleReminderEl.className = `role-reminder role-${priv.roleReminder.role}`;
  }

  function updateAnnouncement(state) {
    const a = state.lastInvestigationAnnouncement;
    if (!a) {
      announcementBannerEl.classList.add("hidden");
      return;
    }
    announcementBannerEl.classList.remove("hidden");
    announcementBannerEl.textContent = `${a.presidentName} گفت ${a.targetName}: ${a.party === "liberal" ? "Liberal" : "Fascist"}`;
  }

  window.onPrivateState = function (priv) {
    privateState = priv;
    updateRoleReminder(priv);
    const autoOverlayPhases = ["legislative_president", "legislative_chancellor"];
    if (
      priv.cards &&
      currentGameState &&
      autoOverlayPhases.includes(currentGameState.phase)
    ) {
      const me = getMyId();
      const show =
        (currentGameState.phase === "legislative_president" &&
          currentGameState.presidentId === me) ||
        (currentGameState.phase === "legislative_chancellor" &&
          currentGameState.chancellorNomineeId === me);
      if (show) renderPrivateOverlay();
    }
    if (currentGameState && (currentGameState.phase === "investigate_announce" || currentGameState.phase === "chancellor_claim" || currentGameState.phase === "president_claim")) {
      renderActions(currentGameState);
    }
  };

  window.initGameClient = function (socket) {
    if (window._gameClientReady) return;
    window._gameClientReady = true;
    window.gameSocket = socket;

    reactionBarEl.querySelectorAll(".reaction-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        socket.emit("sendReaction", { emoji: btn.dataset.emoji });
      });
    });

    socket.on("privateState", (priv) => {
      window.onPrivateState(priv);
    });

    if (window.currentGameState) {
      window.renderGameBoard(window.currentGameState);
    }
  };

  if (window.__SH_SOCKET__) {
    window.initGameClient(window.__SH_SOCKET__);
  }
})();
