(() => {
  const socket = io();
  const $ = id => document.getElementById(id);
  const ui = {
    connection: $("connection"), menu: $("menu"), lobby: $("lobby"), game: $("game"),
    name: $("name"), mode: $("mode"), roomCode: $("roomCode"), create: $("create"),
    join: $("join"), shownCode: $("shownCode"), lobbyStatus: $("lobbyStatus"),
    playerList: $("playerList"), copy: $("copy"), back: $("back"), exit: $("exit"),
    modeLabel: $("modeLabel"), turnLabel: $("turnLabel"), opponentName: $("opponentName"),
    opponentScore: $("opponentScore"), opponentPile: $("opponentPile"), myName: $("myName"),
    myScore: $("myScore"), myPile: $("myPile"), opponentHand: $("opponentHand"),
    deckCount: $("deckCount"), tableCards: $("tableCards"), notice: $("notice"),
    handCards: $("handCards"), play: $("play"), endPanel: $("endPanel"),
    endTitle: $("endTitle"), endText: $("endText"), newRoom: $("newRoom"), toast: $("toast")
  };
  let playerId = null, roomCode = null, gameState = null;
  let selectedHandCard = null;
  let selectedTableIds = new Set();
  let toastTimer;

  function name() { return ui.name.value.trim().slice(0, 20) || "Giocatore"; }
  function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.add("hidden"), 2800);
  }
  function showOnly(section) {
    [ui.menu, ui.lobby, ui.game].forEach(el => el.classList.add("hidden"));
    section.classList.remove("hidden");
  }
  function resetToMenu() {
    playerId = null; roomCode = null; gameState = null;
    selectedHandCard = null; selectedTableIds.clear();
    ui.endPanel.classList.add("hidden");
    showOnly(ui.menu);
  }
  function sendCreate() { socket.emit("room:create", { name: name(), mode: ui.mode.value }); }
  function sendJoin(code) { socket.emit("room:join", { name: name(), code }); }
  ui.create.addEventListener("click", sendCreate);
  ui.join.addEventListener("click", () => {
    const value = ui.roomCode.value.trim().toUpperCase();
    if (!value) return showToast("Inserisci il codice della stanza.");
    sendJoin(value);
  });
  ui.roomCode.addEventListener("input", () => { ui.roomCode.value = ui.roomCode.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); });
  ui.copy.addEventListener("click", async () => {
    const text = `${location.origin}/?room=${roomCode}`;
    try { await navigator.clipboard.writeText(text); showToast("Link copiato!"); }
    catch { showToast(`Codice stanza: ${roomCode}`); }
  });
  ui.back.addEventListener("click", () => { socket.emit("room:leave"); resetToMenu(); });
  ui.exit.addEventListener("click", () => { socket.emit("room:leave"); resetToMenu(); });
  ui.newRoom.addEventListener("click", () => { socket.emit("room:leave"); resetToMenu(); });
  ui.play.addEventListener("click", () => {
    if (!selectedHandCard) return showToast("Seleziona prima una carta dalla tua mano.");
    socket.emit("game:play", { cardId: selectedHandCard, tableCardIds: Array.from(selectedTableIds) });
    selectedHandCard = null; selectedTableIds.clear();
    ui.play.disabled = true;
  });

  socket.on("connect", () => {
    ui.connection.textContent = "Online";
    ui.connection.classList.add("online");
    const code = new URLSearchParams(location.search).get("room");
    if (code && !roomCode) { ui.roomCode.value = code.toUpperCase(); }
  });
  socket.on("disconnect", () => {
    ui.connection.textContent = "Riconnessione…";
    ui.connection.classList.remove("online");
    showToast("Connessione persa. Riprova tra qualche secondo.");
  });
  socket.on("server:ready", () => {
    ui.connection.textContent = "Online";
    ui.connection.classList.add("online");
  });
  socket.on("room:joined", data => {
    roomCode = data.code; playerId = data.playerId;
    ui.shownCode.textContent = roomCode;
    history.replaceState({}, "", `/?room=${roomCode}`);
    showOnly(ui.lobby);
  });
  socket.on("room:state", state => {
    if (state.code) roomCode = state.code;
    renderLobby(state);
    if (state.status === "playing" || state.status === "finished") renderGame(state);
  });
  socket.on("game:state", state => renderGame(state));
  socket.on("game:error", data => showToast(data.message || "Si è verificato un errore."));
  socket.on("room:closed", () => { showToast("La stanza è stata chiusa."); resetToMenu(); });

  function renderLobby(state) {
    if (!state.players) return;
    ui.shownCode.textContent = state.code || roomCode || "------";
    ui.playerList.innerHTML = "";
    state.players.forEach(p => {
      const row = document.createElement("div");
      row.className = "player-row";
      row.innerHTML = `<span>${escapeHtml(p.name)}</span><span>${p.connected === false ? "Offline" : "✓ Connesso"}</span>`;
      ui.playerList.appendChild(row);
    });
    ui.lobbyStatus.textContent = state.players.length < 2 ? "Invita un amico: la partita partirà quando entra." : "Due giocatori collegati. Si parte!";
    if (state.status === "playing" || state.status === "finished") showOnly(ui.game);
    else if (!ui.game.classList.contains("hidden")) return;
    else showOnly(ui.lobby);
  }
  function cardClass(card) {
    return card.suit === "Denari" ? "denari" : card.suit === "Coppe" ? "coppe" : card.suit === "Spade" ? "spade" : "bastoni";
  }
  function makeCard(card, selected, click, compact = false) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `playing-card ${cardClass(card)}${selected ? " selected" : ""}`;
    el.setAttribute("aria-label", card.label);
    el.innerHTML = `<span class="value">${card.value}</span><span class="suit">${card.symbol}</span><span class="name">${escapeHtml(card.suit)}</span>`;
    if (compact) el.style.width = "58px";
    el.addEventListener("click", click);
    return el;
  }
  function renderGame(state) {
    if (!state || !state.players) return;
    gameState = state;
    showOnly(ui.game);
    const me = state.players.find(p => p.id === playerId);
    const opponent = state.players.find(p => p.id !== playerId);
    const myScore = state.scores?.find(p => p.id === playerId);
    const oppScore = state.scores?.find(p => p.id !== playerId);
    ui.modeLabel.textContent = state.mode === "ruba" ? "Ruba Mazzetto" : "Scopa classica";
    ui.myName.textContent = me?.name || "Tu";
    ui.opponentName.textContent = opponent?.name || "Avversario";
    ui.myScore.textContent = myScore?.score ?? 0;
    ui.opponentScore.textContent = oppScore?.score ?? 0;
    ui.myPile.textContent = `${myScore?.cards ?? 0} carte prese`;
    ui.opponentPile.textContent = `${oppScore?.cards ?? 0} carte prese`;
    ui.deckCount.textContent = `${state.deckCount} nel mazzo`;
    ui.turnLabel.textContent = state.status === "finished" ? "Fine partita" : state.currentPlayerId === playerId ? "È il tuo turno" : "Turno avversario";
    ui.notice.textContent = state.lastMove || "";
    ui.opponentHand.innerHTML = "";
    for (let i = 0; i < (state.opponentHandCount || 0); i++) {
      const back = document.createElement("div"); back.className = "back-card"; ui.opponentHand.appendChild(back);
    }
    ui.tableCards.innerHTML = "";
    (state.table || []).forEach(card => {
      ui.tableCards.appendChild(makeCard(card, selectedTableIds.has(card.id), () => {
        if (selectedTableIds.has(card.id)) selectedTableIds.delete(card.id);
        else selectedTableIds.add(card.id);
        renderGame(state);
      }, true));
    });
    ui.handCards.innerHTML = "";
    (state.hand || []).forEach(card => {
      ui.handCards.appendChild(makeCard(card, selectedHandCard === card.id, () => {
        selectedHandCard = card.id;
        ui.play.disabled = state.currentPlayerId !== playerId || state.status !== "playing";
        renderGame(state);
      }));
    });
    ui.play.disabled = !selectedHandCard || state.currentPlayerId !== playerId || state.status !== "playing";
    if (state.status === "finished") {
      ui.endPanel.classList.remove("hidden");
      ui.endTitle.textContent = state.winner === "pareggio" ? "Pareggio!" : state.winner === playerId ? "Hai vinto! 🎉" : "Partita terminata";
      ui.endText.textContent = `${me?.name || "Tu"}: ${myScore?.score ?? 0} punti · ${opponent?.name || "Avversario"}: ${oppScore?.score ?? 0} punti`;
    } else {
      ui.endPanel.classList.add("hidden");
    }
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  const queryRoom = new URLSearchParams(location.search).get("room");
  if (queryRoom) ui.roomCode.value = queryRoom.toUpperCase();
})();