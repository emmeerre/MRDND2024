window.R20 = window.R20 || {};

R20.zoom = 1.0;

// Ruolo locale del dispositivo (di default ha accesso completo da Host/Master)
R20.myRole = {
    canEdit: true,
    tokenControl: 'all' // 'all', 'none' oppure l'ID specifico della pedina (es. 1)
};

// Stato della rete WebRTC P2P
R20.p2p = {
    peer: null,
    isHost: false,
    connections: [], // Per l'Host: lista dei client connessi
    hostConn: null,  // Per il Client: connessione verso l'Host
    roomId: null
};

// ============================================================================
// 1. CONFIGURAZIONE ICE: STUN + TURN GRATUITI PER IL 4G / CELLULARE
// ============================================================================
R20.ICE_CONFIG = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:openrelay.metered.ca:80" },
        {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject"
        },
        {
            urls: "turn:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject"
        },
        {
            urls: "turn:openrelay.metered.ca:443?transport=tcp",
            username: "openrelayproject",
            credential: "openrelayproject"
        }
    ]
};

// ============================================================================
// 2. RETE WEBRTC P2P: HOST, CLIENT E GESTIONE PERMESSI
// ============================================================================

R20.openP2PModal = function() {
    document.getElementById('p2p-modal').style.display = 'flex';
    document.getElementById('p2p-host-room').value = localStorage.getItem('r20_last_room') || 'tavolo-dnd-' + Math.floor(100 + Math.random() * 900);
    document.getElementById('p2p-join-room').value = localStorage.getItem('r20_last_room') || '';
    if (R20.p2p.isHost) {
        document.getElementById('p2p-host-clients-panel').style.display = 'block';
        R20.renderConnectedPlayersPanel();
    }
};

R20.closeP2PModal = function() {
    document.getElementById('p2p-modal').style.display = 'none';
};

/**
 * AVVIO HOST (MASTER)
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
        const peer = new Peer(roomId, { config: R20.ICE_CONFIG });
        R20.p2p.peer = peer;
        R20.p2p.isHost = true;
        R20.p2p.roomId = rawRoom;
        R20.p2p.connections = [];

        peer.on('open', () => {
            statusMsg.innerText = `✔ Stanza attiva! Codice: ${rawRoom}`;
            statusMsg.style.color = "#2ecc71";
            const btnCopy = document.getElementById('btn-copy-invite');
            if (btnCopy) btnCopy.style.display = 'block';
            document.getElementById('p2p-host-clients-panel').style.display = 'block';
            R20.updateP2PStatusBadge(`🟢 Host (${rawRoom}) - 0 connessi`, "#2ecc71");
            R20.addChatMessage("Rete P2P", `Stanza Host aperta: <b>${rawRoom}</b>`);
            R20.renderConnectedPlayersPanel();
        });

        peer.on('connection', (conn) => {
            // Assegna dati e permessi base al dispositivo che si connette
            conn.playerInfo = {
                id: conn.peer,
                name: 'Dispositivo ' + (R20.p2p.connections.length + 1),
                canEdit: false,        // Di default il giocatore NON può modificare i muri
                tokenControl: 'all'    // Di default può muovere tutte le pedine (modificabile dal Master)
            };
            R20.p2p.connections.push(conn);

            conn.on('open', () => {
                R20.updateHostConnectionsCount();
                R20.renderConnectedPlayersPanel();

                // Spedisce subito lo stato completo e i permessi assegnati
                conn.send({ type: 'FULL_SYNC', state: R20.getGameState() });
                R20.sendPermissionsToClient(conn);
                R20.addChatMessage("Rete P2P", `Dispositivo connesso (${conn.playerInfo.name})!`);
            });

            conn.on('data', (data) => {
                R20.handleNetworkMessage(data);
                // L'Host fa da tramite e inoltra a tutti gli altri peer
                R20.broadcast(data, conn);
                R20.autoSave();
            });

            conn.on('close', () => {
                R20.p2p.connections = R20.p2p.connections.filter(c => c !== conn);
                R20.updateHostConnectionsCount();
                R20.renderConnectedPlayersPanel();
            });
        });

        peer.on('error', (err) => {
            if (err.type === 'unavailable-id') {
                statusMsg.innerText = "❌ Codice occupato! Se hai appena ricaricato, aspetta 30 sec o cambia nome.";
            } else {
                statusMsg.innerText = `Errore: ${err.type}`;
            }
            statusMsg.style.color = "#e74c3c";
        });
    } catch (e) {
        statusMsg.innerText = "Errore: " + e.message;
        statusMsg.style.color = "#e74c3c";
    }
};

/**
 * AVVIO CLIENT (GIOCATORE / CELLULARE)
 */
R20.joinClientP2P = function(roomOverride = null) {
    const rawRoom = roomOverride || document.getElementById('p2p-join-room').value.trim();
    const statusMsg = document.getElementById('p2p-status-msg');
    if (!rawRoom) return;

    const hostRoomId = 'r20vtt-' + rawRoom.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    localStorage.setItem('r20_last_room', rawRoom);

    if (statusMsg) {
        statusMsg.innerText = "⏳ Connessione in corso (STUN/TURN 4G)...";
        statusMsg.style.color = "#f39c12";
    }

    if (R20.p2p.peer) R20.p2p.peer.destroy();

    try {
        const peer = new Peer({ config: R20.ICE_CONFIG });
        R20.p2p.peer = peer;
        R20.p2p.isHost = false;
        R20.p2p.roomId = rawRoom;

        peer.on('open', () => {
            const conn = peer.connect(hostRoomId, { reliable: true });
            R20.p2p.hostConn = conn;

            conn.on('open', () => {
                if (statusMsg) {
                    statusMsg.innerText = `✔ Connesso a ${rawRoom}!`;
                    statusMsg.style.color = "#2ecc71";
                }
                R20.updateP2PStatusBadge(`🟢 Connesso (${rawRoom})`, "#00c3ff");
                R20.addChatMessage("Rete P2P", `Connesso alla stanza: <b>${rawRoom}</b>`);
                setTimeout(R20.closeP2PModal, 800);
            });

            conn.on('data', (data) => R20.handleNetworkMessage(data));

            conn.on('close', () => {
                R20.updateP2PStatusBadge("🔴 Disconnesso", "#e74c3c");
                R20.addChatMessage("Rete P2P", "Disconnesso dall'Host.");
            });
        });

        peer.on('error', () => {
            if (statusMsg) {
                statusMsg.innerText = "❌ Host non trovato. Assicurati che il Master abbia premuto 'Crea Stanza'!";
                statusMsg.style.color = "#e74c3c";
            }
        });
    } catch (e) {
        if (statusMsg) statusMsg.innerText = "Errore: " + e.message;
    }
};

R20.copyInviteLink = function() {
    const url = window.location.origin + window.location.pathname + '?room=' + encodeURIComponent(R20.p2p.roomId);
    navigator.clipboard.writeText(url).then(() => {
        alert("Link copiato negli appunti!\nCondividilo con il secondo dispositivo:\n" + url);
    });
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
 * TRASMISSIONE EVENTI AGLI ALTRI DISPOSITIVI
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
 * RICEZIONE ED ESECUZIONE DEI MESSAGGI DI RETE
 */
R20.handleNetworkMessage = function(data) {
    if (!data || !data.type) return;

    switch (data.type) {
        case 'FULL_SYNC':
            R20.loadGameState(data.state, false);
            break;

        case 'SET_PERMISSIONS':
            R20.applyClientPermissions(data.role);
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
// 3. APPLICAZIONE DEI PERMESSI (EDIT MAPPA E CONTROLLO PEDINE)
// ============================================================================

R20.applyClientPermissions = function(role) {
    R20.myRole = role;

    // Se l'Host revoca l'edit mappa, nasconde la scheda Mappa sul cellulare del giocatore
    const editTabBtn = document.querySelector(".tab-btn[onclick*='edit-tab']");
    if (editTabBtn) {
        editTabBtn.style.display = role.canEdit ? 'block' : 'none';
        if (!role.canEdit && document.getElementById('edit-tab').classList.contains('active')) {
            R20.switchTab('token-tab');
        }
    }

    let msg = `Permessi aggiornati: Edit Mappa [${role.canEdit ? 'Sì' : 'No'}], `;
    if (role.tokenControl === 'all') msg += `Controllo: [Tutte le Pedine]`;
    else if (role.tokenControl === 'none') msg += `Controllo: [Nessuna - Solo Spettatore]`;
    else {
        const t = R20.tokens.find(tok => tok.id == role.tokenControl);
        msg += `Controllo: [Solo ${t ? t.name : role.tokenControl}]`;
    }
    R20.addChatMessage("Permessi", msg);
};

R20.sendPermissionsToClient = function(conn) {
    if (conn && conn.open) {
        conn.send({
            type: 'SET_PERMISSIONS',
            role: {
                canEdit: conn.playerInfo.canEdit,
                tokenControl: conn.playerInfo.tokenControl
            }
        });
    }
};

R20.renderConnectedPlayersPanel = function() {
    const container = document.getElementById('p2p-connected-players-list');
    if (!container) return;

    if (R20.p2p.connections.length === 0) {
        container.innerHTML = '<div style="font-size:11px; color:#888;">Nessun giocatore attualmente connesso.</div>';
        return;
    }

    container.innerHTML = R20.p2p.connections.map((conn, idx) => {
        const info = conn.playerInfo;
        const tokensOptions = `
            <option value="all" ${info.tokenControl === 'all' ? 'selected' : ''}>Tutte le pedine</option>
            <option value="none" ${info.tokenControl === 'none' ? 'selected' : ''}>Nessuna (Spettatore)</option>
            ${R20.tokens.map(t => `<option value="${t.id}" ${info.tokenControl == t.id ? 'selected' : ''}>Solo: ${t.name}</option>`).join('')}
        `;

        return `
            <div style="background:#1e1f26; padding:6px; border-radius:4px; font-size:11px; display:flex; flex-direction:column; gap:4px;">
                <div style="font-weight:bold; color:#00c3ff;">📱 ${info.name}</div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <label>Edit Mappa:</label>
                    <select onchange="R20.updatePlayerPerm(${idx}, 'canEdit', this.value === 'yes')" style="background:#111; color:#fff; border:1px solid #444; font-size:10px;">
                        <option value="no" ${!info.canEdit ? 'selected' : ''}>No</option>
                        <option value="yes" ${info.canEdit ? 'selected' : ''}>Sì</option>
                    </select>

                    <label style="margin-left:4px;">Pedina:</label>
                    <select onchange="R20.updatePlayerPerm(${idx}, 'tokenControl', this.value)" style="background:#111; color:#fff; border:1px solid #444; font-size:10px; flex:1;">
                        ${tokensOptions}
                    </select>
                </div>
            </div>
        `;
    }).join('');
};

R20.updatePlayerPerm = function(connIdx, field, value) {
    const conn = R20.p2p.connections[connIdx];
    if (conn) {
        conn.playerInfo[field] = value;
        R20.sendPermissionsToClient(conn);
    }
};

// ============================================================================
// 4. AUTOSALVATAGGIO CONTINUO & BACKUP JSON
// ============================================================================

R20.autoSave = function() {
    try {
        const state = R20.getGameState();
        localStorage.setItem('roll20_scenario_save', JSON.stringify(state));
    } catch (e) {
        console.warn("Autosave locale non riuscito:", e);
    }
};

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
// 5. ZOOM & CAMBIO SCHEDE UI
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
// 6. AVVIO, EVENTI & CONTROLLO INIZIALE
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
    // Genera icone status
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

    // Movimento tastiera (rispetta i permessi assegnati)
    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
        if (!R20.selectedTokenId) return;

        const tok = R20.tokens.find(t => t.id === R20.selectedTokenId);
        if (!tok) return;

        // Se il giocatore non ha il permesso di muovere questa pedina, blocca il tasto
        if (R20.myRole && R20.myRole.tokenControl !== 'all') {
            if (R20.myRole.tokenControl === 'none' || R20.myRole.tokenControl != tok.id) {
                return;
            }
        }

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
                R20.broadcast({ type: 'TOKEN_MOVE', id: tok.id, x: tok.x, y: tok.y });
            } else {
                R20.triggerCollisionAlert(tok);
            }
        }
    });

    // RECUPERO AUTOMATICO: Ricarica l'ultima sessione salvata
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

    // CONNESSIONE AUTOMATICA DA LINK: se l'URL ha ?room=... (es. aperto dal cellulare)
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        R20.addChatMessage("Rete P2P", `Connessione automatica alla stanza: <b>${roomParam}</b>...`);
        R20.joinClientP2P(roomParam);
    }
});

// Chiusura pulita della connessione al refresh/chiusura scheda
window.addEventListener('beforeunload', () => {
    if (R20.p2p && R20.p2p.peer) {
        R20.p2p.peer.destroy();
    }
});
