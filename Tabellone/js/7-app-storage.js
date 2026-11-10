window.R20 = window.R20 || {};

R20.zoom = 1.0;

// --- STATO WEBRTC P2P & NETWORKING ---
R20.p2p = {
    peer: null,
    isHost: false,
    connections: [], // per l'Host: lista di tutti i client connessi
    hostConn: null,  // per il Client: connessione verso l'Host
    roomId: null
};

// ============================================================================
// 1. MOTORE DI SINCRONIZZAZIONE WEBRTC IN TEMPO REALE (< 50ms)
// ============================================================================

R20.openP2PModal = function() {
    document.getElementById('p2p-modal').style.display = 'flex';
    document.getElementById('p2p-host-room').value = localStorage.getItem('r20_last_room') || 'tavolo-dnd-' + Math.floor(100 + Math.random() * 900);
    document.getElementById('p2p-join-room').value = localStorage.getItem('r20_last_room') || '';
};

R20.closeP2PModal = function() {
    document.getElementById('p2p-modal').style.display = 'none';
};

/**
 * AVVIA COME HOST (Master)
 */
R20.startHostP2P = function() {
    const rawRoom = document.getElementById('p2p-host-room').value.trim();
    const statusMsg = document.getElementById('p2p-status-msg');
    if (!rawRoom) return;

    const roomId = 'r20vtt-' + rawRoom.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    localStorage.setItem('r20_last_room', rawRoom);

    statusMsg.innerText = "⏳ Creazione stanza in corso...";
    statusMsg.style.color = "#f39c12";

    if (R20.p2p.peer) R20.p2p.peer.destroy();

    try {
        const peer = new Peer(roomId);
        R20.p2p.peer = peer;
        R20.p2p.isHost = true;
        R20.p2p.roomId = rawRoom;
        R20.p2p.connections = [];

        peer.on('open', (id) => {
            statusMsg.innerText = `✔ Stanza attiva! Codice: ${rawRoom}`;
            statusMsg.style.color = "#2ecc71";
            R20.updateP2PStatusBadge(`🟢 Host (${rawRoom}) - 0 connessi`, "#2ecc71");
            R20.addChatMessage("Rete P2P", `Stanza Host aperta con codice: <b>${rawRoom}</b>`);
            setTimeout(R20.closeP2PModal, 1200);
        });

        // Quando un giocatore si collega all'Host
        peer.on('connection', (conn) => {
            R20.p2p.connections.push(conn);

            conn.on('open', () => {
                R20.updateHostConnectionsCount();
                // Spedisci subito l'intero stato del tavolo aggiornato al nuovo arrivato
                conn.send({
                    type: 'FULL_SYNC',
                    state: R20.getGameState()
                });
                R20.addChatMessage("Rete P2P", "Un dispositivo si è unito al tavolo!");
            });

            conn.on('data', (data) => {
                R20.handleNetworkMessage(data, false);
                // L'Host fa da ponte: rimanda il dato a tutti gli altri giocatori collegati
                R20.broadcast(data, conn);
                R20.autoSave();
            });

            conn.on('close', () => {
                R20.p2p.connections = R20.p2p.connections.filter(c => c !== conn);
                R20.updateHostConnectionsCount();
            });
        });

        peer.on('error', (err) => {
            if (err.type === 'unavailable-id') {
                statusMsg.innerText = "❌ Codice già in uso! Scegline un altro o entra come giocatore.";
            } else {
                statusMsg.innerText = `Errore Peer: ${err.type}`;
            }
            statusMsg.style.color = "#e74c3c";
        });
    } catch (e) {
        statusMsg.innerText = "Errore creazione peer: " + e.message;
        statusMsg.style.color = "#e74c3c";
    }
};

/**
 * ENTRA COME GIOCATORE / 2° DISPOSITIVO
 */
R20.joinClientP2P = function() {
    const rawRoom = document.getElementById('p2p-join-room').value.trim();
    const statusMsg = document.getElementById('p2p-status-msg');
    if (!rawRoom) return;

    const hostRoomId = 'r20vtt-' + rawRoom.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    localStorage.setItem('r20_last_room', rawRoom);

    statusMsg.innerText = "⏳ Connessione all'Host...";
    statusMsg.style.color = "#f39c12";

    if (R20.p2p.peer) R20.p2p.peer.destroy();

    try {
        const peer = new Peer();
        R20.p2p.peer = peer;
        R20.p2p.isHost = false;
        R20.p2p.roomId = rawRoom;

        peer.on('open', () => {
            const conn = peer.connect(hostRoomId);
            R20.p2p.hostConn = conn;

            conn.on('open', () => {
                statusMsg.innerText = `✔ Connesso all'Host ${rawRoom}!`;
                statusMsg.style.color = "#2ecc71";
                R20.updateP2PStatusBadge(`🟢 Connesso (${rawRoom})`, "#00c3ff");
                R20.addChatMessage("Rete P2P", `Connesso alla stanza: <b>${rawRoom}</b>`);
                setTimeout(R20.closeP2PModal, 1000);
            });

            conn.on('data', (data) => {
                R20.handleNetworkMessage(data, false);
            });

            conn.on('close', () => {
                R20.updateP2PStatusBadge("🔴 Disconnesso", "#e74c3c");
                R20.addChatMessage("Rete P2P", "Disconnesso dall'Host.");
            });
        });

        peer.on('error', (err) => {
            statusMsg.innerText = `Errore di connessione: stanza non trovata o non attiva.`;
            statusMsg.style.color = "#e74c3c";
        });
    } catch (e) {
        statusMsg.innerText = "Errore: " + e.message;
        statusMsg.style.color = "#e74c3c";
    }
};

R20.updateHostConnectionsCount = function() {
    const count = R20.p2p.connections.length;
    R20.updateP2PStatusBadge(`🟢 Host (${R20.p2p.roomId}) - ${count} connessi`, "#2ecc71");
};

R20.updateP2PStatusBadge = function(text, color) {
    const btn = document.getElementById('btn-p2p-status');
    if (btn) {
        btn.innerText = text;
        btn.style.background = color;
    }
};

/**
 * TRASMETTE UN EVENTO LIVE AGLI ALTRI DISPOSITIVI
 */
R20.broadcast = function(msg, excludeConn = null) {
    if (R20.p2p.isHost) {
        R20.p2p.connections.forEach(conn => {
            if (conn !== excludeConn && conn.open) {
                conn.send(msg);
            }
        });
        R20.autoSave();
    } else if (R20.p2p.hostConn && R20.p2p.hostConn.open) {
        R20.p2p.hostConn.send(msg);
    }
};

/**
 * RICEVE ED ESEGUE IL MESSAGGIO LIVE DALL'ALTRO DISPOSITIVO
 */
R20.handleNetworkMessage = function(data) {
    if (!data || !data.type) return;

    switch (data.type) {
        case 'FULL_SYNC':
            R20.loadGameState(data.state, false);
            break;

        case 'TOKEN_MOVE': {
            const tok = R20.tokens.find(t => t.id === data.id);
            if (tok) {
                tok.x = data.x;
                tok.y = data.y;
                R20.updateTokenVisuals(tok);
                R20.updateVision();
            }
            break;
        }

        case 'TOKEN_HP': {
            const tok = R20.tokens.find(t => t.id === data.id);
            if (tok) {
                tok.hp = data.hp;
                R20.updateTokenVisuals(tok);
                if (R20.selectedTokenId === tok.id) R20.fillTokenEditor(tok);
                R20.renderTokenListView();
            }
            break;
        }

        case 'TOKEN_UPDATE_ALL': {
            const idx = R20.tokens.findIndex(t => t.id === data.token.id);
            if (idx !== -1) {
                const el = R20.tokens[idx].el;
                R20.tokens[idx] = data.token;
                R20.tokens[idx].statuses = new Set(data.token.statuses || []);
                R20.tokens[idx].el = el;
                R20.updateTokenVisuals(R20.tokens[idx]);
                if (R20.selectedTokenId === data.token.id) R20.fillTokenEditor(R20.tokens[idx]);
                R20.renderTokenListView();
                R20.updateVision();
            }
            break;
        }

        case 'TOKEN_SPAWN':
            R20.tokens.push(data.token);
            data.token.statuses = new Set(data.token.statuses || []);
            R20.initTokens();
            break;

        case 'TOKEN_DELETE':
            R20.tokens = R20.tokens.filter(t => t.id !== data.id);
            if (R20.selectedTokenId === data.id) R20.selectToken(null);
            R20.initTokens();
            break;

        case 'POLY_SYNC':
            R20.polygons = data.polygons || [];
            R20.renderPolygons();
            R20.updatePolygonsSidebar();
            R20.updateVision();
            break;

        case 'INIT_SYNC':
            R20.initiativeList = data.list || [];
            R20.currentTurnIndex = data.currentTurnIndex || 0;
            R20.currentRound = data.currentRound || 1;
            R20.renderInitiative();
            break;

        case 'CHAT_MSG':
            R20.addChatMessage(data.title, data.detail, data.total);
            break;

        case 'SCENE_LIGHT':
            R20.sceneLighting = data.lighting;
            const btnLight = document.getElementById('btn-scene-light');
            if (btnLight) {
                btnLight.innerText = R20.sceneLighting === 'bright' ? '☀️ Giorno' : '🌙 Buio';
                btnLight.className = R20.sceneLighting === 'bright' ? 'btn btn-warning' : 'btn';
            }
            R20.updateVision();
            break;
    }
};

// ============================================================================
// 2. SALVATAGGIO AUTOMATICO CONTINUO & LOCALSTORAGE
// ============================================================================

R20.autoSave = function() {
    try {
        const state = R20.getGameState();
        localStorage.setItem('roll20_scenario_save', JSON.stringify(state));
    } catch (e) {
        console.warn("Autosave storage full or disabled:", e);
    }
};

// ============================================================================
// 3. ZOOM & CONTROLLI GENERALI
// ============================================================================

R20.setZoom = function(val) {
    R20.zoom = Math.max(0.3, Math.min(2.5, Math.round(val * 100) / 100));
    const board = document.getElementById('board');
    const boardWrapper = document.getElementById('board-wrapper');
    if (board && boardWrapper) {
        board.style.transform = `scale(${R20.zoom})`;
        boardWrapper.style.width = `${2600 * R20.zoom}px`;
        boardWrapper.style.height = `${2600 * R20.zoom}px`;
    }
    const lbl = document.getElementById('zoom-label');
    if (lbl) lbl.innerText = `${Math.round(R20.zoom * 100)}%`;
};

R20.changeZoom = function(delta) {
    R20.setZoom(R20.zoom + delta);
};

R20.switchTab = function(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(tabId));
    if (activeBtn) activeBtn.classList.add('active');

    const content = document.getElementById(tabId);
    if (content) content.classList.add('active');
};

// ============================================================================
// 4. BACKUP ED ESPORTAZIONE FILE JSON
// ============================================================================

R20.getGameState = function() {
    return {
        version: 4,
        sceneLighting: R20.sceneLighting,
        zoom: R20.zoom,
        tokens: R20.tokens.map(t => ({
            id: t.id,
            name: t.name,
            symbol: t.symbol,
            hp: t.hp,
            maxHp: t.maxHp,
            ac: t.ac,
            color: t.color,
            x: t.x,
            y: t.y,
            size: t.size || 1,
            imgUrl: t.imgUrl || '',
            initBonus: t.initBonus,
            visionRadius: t.visionRadius,
            hasDarkvision: t.hasDarkvision,
            darkvisionRange: t.darkvisionRange,
            attacks: t.attacks,
            statuses: Array.from(t.statuses)
        })),
        polygons: R20.polygons.map(p => ({
            id: p.id,
            name: p.name,
            layer: p.layer,
            blocksVision: p.blocksVision,
            passable: p.passable,
            color: p.color || '#2c3e50',
            texture: p.texture || 'none',
            customTextureUrl: p.customTextureUrl || '',
            emitsLight: p.emitsLight,
            lightRadius: p.lightRadius,
            lightColor: p.lightColor,
            points: p.points
        })),
        initiative: {
            list: R20.initiativeList,
            currentTurnIndex: R20.currentTurnIndex,
            currentRound: R20.currentRound
        }
    };
};

R20.exportGameData = function() {
    const data = R20.getGameState();
    R20.autoSave();

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roll20_scenario_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    R20.addChatMessage("Backup", "File JSON scaricato e salvataggio locale aggiornato.");
};

R20.triggerImportGameData = function() {
    document.getElementById('import-file-input').click();
};

R20.importGameDataFile = function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            R20.loadGameState(data, true);
        } catch(err) {
            alert("Errore nel file di salvataggio: " + err.message);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
};

R20.loadGameState = function(state, shouldBroadcast = true) {
    if (!state) return;

    R20.sceneLighting = state.sceneLighting || 'dark';
    const btnLight = document.getElementById('btn-scene-light');
    if (btnLight) {
        btnLight.innerText = R20.sceneLighting === 'bright' ? '☀️ Giorno' : '🌙 Buio';
        btnLight.className = R20.sceneLighting === 'bright' ? 'btn btn-warning' : 'btn';
    }

    if (state.zoom) R20.setZoom(state.zoom);

    R20.tokens = (state.tokens || []).map(t => {
        const tok = R20.makeToken(
            t.id, t.name, t.symbol, t.hp, t.maxHp, t.ac, t.color, t.x, t.y,
            t.attacks, t.initBonus, t.visionRadius, t.hasDarkvision, t.darkvisionRange,
            t.size || 1, t.imgUrl || ''
        );
        tok.statuses = new Set(t.statuses || []);
        return tok;
    });

    R20.polygons = state.polygons || [];

    if (state.initiative) {
        R20.initiativeList = state.initiative.list || [];
        R20.currentTurnIndex = state.initiative.currentTurnIndex || 0;
        R20.currentRound = state.initiative.currentRound || 1;
    }

    R20.selectedTokenId = null;
    R20.selectedPolygonId = null;
    R20.initTokens();

    if (shouldBroadcast) {
        R20.broadcast({ type: 'FULL_SYNC', state: R20.getGameState() });
        R20.autoSave();
    }
};

// ============================================================================
// 5. AVVIO & RECUPERO AUTOMATICO DALLA MEMORIA LOCALE
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
    // Genera pulsanti condizioni
    const statusPicker = document.getElementById('status-picker');
    if (statusPicker) {
        R20.STATUSES.forEach(icon => {
            const btn = document.createElement('div');
            btn.className = 'status-btn';
            btn.innerText = icon;
            btn.onclick = () => R20.toggleStatus(icon);
            statusPicker.appendChild(btn);
        });
    }

    // Deselezione al clic su mappa vuota
    const viewport = document.getElementById('viewport');
    if (viewport) {
        viewport.addEventListener('click', (e) => {
            if (R20.isEditMode) return;
            if (e.target.closest('.token') || e.target.closest('.bubble') || e.target.closest('.hp-popover') || e.target.closest('#zoom-widget')) {
                return;
            }
            R20.selectToken(null);
        });

        viewport.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) {
                e.preventDefault();
                R20.changeZoom(e.deltaY < 0 ? 0.1 : -0.1);
            }
        }, { passive: false });
    }

    // Tracciamento poligoni in Edit Mode
    const board = document.getElementById('board');
    if (board) {
        board.addEventListener('click', (e) => {
            if (!R20.isEditMode) return;
            const coords = R20.getBoardCoords(e);
            const px = Math.round(coords.x / 25) * 25;
            const py = Math.round(coords.y / 25) * 25;
            R20.currentDrawPoints.push([px, py]);
            R20.renderPolygons();
        });
    }

    // Movimento tastiera con trasmissione Live
    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
        if (!R20.selectedTokenId) return;

        const tok = R20.tokens.find(t => t.id === R20.selectedTokenId);
        if (!tok) return;

        let nextX = tok.x;
        let nextY = tok.y;
        let isArrow = false;

        if (e.key === 'ArrowUp') { nextY = Math.max(0, tok.y - R20.GRID_SIZE); isArrow = true; }
        else if (e.key === 'ArrowDown') { nextY = tok.y + R20.GRID_SIZE; isArrow = true; }
        else if (e.key === 'ArrowLeft') { nextX = Math.max(0, tok.x - R20.GRID_SIZE); isArrow = true; }
        else if (e.key === 'ArrowRight') { nextX = tok.x + R20.GRID_SIZE; isArrow = true; }

        if (isArrow) {
            e.preventDefault();
            if (R20.canTokenMoveTo(nextX, nextY, tok.size)) {
                tok.x = nextX;
                tok.y = nextY;
                R20.updateTokenVisuals(tok);
                R20.updateVision();
                // Trasmetti la mossa in diretta agli altri dispositivi
                R20.broadcast({ type: 'TOKEN_MOVE', id: tok.id, x: tok.x, y: tok.y });
            } else {
                R20.triggerCollisionAlert(tok);
            }
        }
    });

    // RECUPERO AUTOMATICO: se c'era una sessione salvata, la ricarica subito
    const saved = localStorage.getItem('roll20_scenario_save');
    if (saved) {
        try {
            R20.loadGameState(JSON.parse(saved), false);
        } catch(e) {
            R20.initTokens();
        }
    } else {
        R20.initTokens();
    }

    R20.setZoom(1.0);
});