window.R20 = window.R20 || {};

R20.zoom = 1.0;

R20.myRole = {
    isHost: false,
    canEdit: true,
    tokenControl: 'all'
};

R20.p2p = {
    peer: null,
    isHost: false,
    connections: [],
    hostConn: null,
    roomId: null
};

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
        }
    ]
};

// ============================================================================
// 1. GESTIONE CONNESSIONE P2P STABILE
// ============================================================================

R20.openP2PModal = function() {
    document.getElementById('p2p-modal').style.display = 'flex';
    document.getElementById('p2p-host-room').value = localStorage.getItem('r20_last_room') || 'tavolo-dnd-' + Math.floor(100 + Math.random() * 900);
    document.getElementById('p2p-join-room').value = localStorage.getItem('r20_last_room') || '';
    const statusMsg = document.getElementById('p2p-status-msg');
    if (statusMsg) statusMsg.innerText = '';
};

R20.closeP2PModal = function() {
    document.getElementById('p2p-modal').style.display = 'none';
};

R20.startHostP2P = function() {
    const rawRoom = document.getElementById('p2p-host-room').value.trim();
    const statusMsg = document.getElementById('p2p-status-msg');
    if (!rawRoom) return;

    const roomId = 'r20vtt-' + rawRoom.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    localStorage.setItem('r20_last_room', rawRoom);

    statusMsg.innerText = "⏳ Creazione stanza...";
    statusMsg.style.color = "#f39c12";

    if (R20.p2p.peer) {
        try { R20.p2p.peer.destroy(); } catch(e) {}
    }

    try {
        const peer = new Peer(roomId, { config: R20.ICE_CONFIG, debug: 1 });
        R20.p2p.peer = peer;
        R20.p2p.isHost = true;
        R20.p2p.roomId = rawRoom;
        R20.p2p.connections = [];
        R20.myRole.isHost = true;

        peer.on('open', () => {
            statusMsg.innerText = `✔ Stanza attiva! Codice: ${rawRoom}`;
            statusMsg.style.color = "#2ecc71";
            const btnCopy = document.getElementById('btn-copy-invite');
            if (btnCopy) btnCopy.style.display = 'block';
            R20.updateP2PStatusBadge(`🟢 Host (${rawRoom})`, "#2ecc71");
            R20.renderPlayersTabAndDock();
            setTimeout(R20.closeP2PModal, 700);
        });

        peer.on('connection', (conn) => {
            conn.playerInfo = {
                id: conn.peer,
                name: 'Giocatore ' + (R20.p2p.connections.length + 1),
                canEdit: false,
                tokenControl: 'all'
            };
            R20.p2p.connections.push(conn);

            conn.on('open', () => {
                R20.updateHostConnectionsCount();
                // Spedisce lo scenario senza causare loop
                conn.send({ type: 'FULL_SYNC', state: R20.getGameState() });
                R20.sendPermissionsToClient(conn);
                R20.renderPlayersTabAndDock();
            });

            conn.on('data', (data) => {
                R20.handleNetworkMessage(data);
                R20.broadcast(data, conn);
                R20.autoSave();
            });

            conn.on('close', () => {
                R20.p2p.connections = R20.p2p.connections.filter(c => c !== conn);
                R20.updateHostConnectionsCount();
                R20.renderPlayersTabAndDock();
            });
        });

        peer.on('error', (err) => {
            if (err.type === 'unavailable-id') {
                statusMsg.innerText = "❌ Codice occupato! Aggiungi un numero (es. " + rawRoom + "-1).";
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

R20.joinClientP2P = function(roomOverride = null) {
    const rawRoom = roomOverride || document.getElementById('p2p-join-room').value.trim();
    const statusMsg = document.getElementById('p2p-status-msg');
    if (!rawRoom) return;

    const hostRoomId = 'r20vtt-' + rawRoom.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    localStorage.setItem('r20_last_room', rawRoom);

    if (statusMsg) {
        statusMsg.innerText = "⏳ Ricerca Host in corso...";
        statusMsg.style.color = "#f39c12";
    }

    if (R20.p2p.peer) {
        try { R20.p2p.peer.destroy(); } catch(e) {}
    }

    try {
        const peer = new Peer({ config: R20.ICE_CONFIG, debug: 1 });
        R20.p2p.peer = peer;
        R20.p2p.isHost = false;
        R20.p2p.roomId = rawRoom;
        R20.myRole.isHost = false;

        peer.on('open', () => {
            // Connessione diretta senza wrapper legacy per massima stabilità
            const conn = peer.connect(hostRoomId);
            R20.p2p.hostConn = conn;

            conn.on('open', () => {
                if (statusMsg) {
                    statusMsg.innerText = `✔ Connesso a ${rawRoom}!`;
                    statusMsg.style.color = "#2ecc71";
                }
                R20.updateP2PStatusBadge(`🟢 Connesso (${rawRoom})`, "#00c3ff");
                R20.renderPlayersTabAndDock();
                setTimeout(R20.closeP2PModal, 700);
            });

            conn.on('data', (data) => R20.handleNetworkMessage(data));

            conn.on('close', () => {
                R20.updateP2PStatusBadge("🔴 Disconnesso", "#e74c3c");
                R20.renderPlayersTabAndDock();
            });
        });

        peer.on('error', () => {
            if (statusMsg) {
                statusMsg.innerText = "❌ Stanza non trovata. Verifica che l'Host sia online!";
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
        alert("Link copiato negli appunti!\nIncollalo sul secondo schermo:\n" + url);
    });
};

R20.updateHostConnectionsCount = function() {
    const count = R20.p2p.connections.length;
    R20.updateP2PStatusBadge(`🟢 Host (${R20.p2p.roomId}) - ${count} conn`, "#2ecc71");
};

R20.updateP2PStatusBadge = function(text, color) {
    const btn = document.getElementById('btn-p2p-status');
    if (btn) {
        btn.innerText = text;
        btn.style.background = color;
    }
};

/**
 * TRASMETTE I DATI AGLI ALTRI DISPOSITIVI
 */
R20.broadcast = function(msg, excludeConn = null) {
    if (R20.p2p.isHost) {
        R20.p2p.connections.forEach(conn => {
            if (conn !== excludeConn && conn.open) {
                try { conn.send(msg); } catch(e) {}
            }
        });
        R20.autoSave();
    } else if (R20.p2p.hostConn && R20.p2p.hostConn.open) {
        try { R20.p2p.hostConn.send(msg); } catch(e) {}
    }
};

/**
 * RICEVE E APPLICA I DATI SENZA RE-INVIARLI (ZERO LOOP)
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
                if (R20.updateVision) R20.updateVision();
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
                if (R20.updateVision) R20.updateVision();
            }
            break;
        }

        case 'TOKEN_SPAWN':
            data.token.statuses = new Set(data.token.statuses || []);
            R20.tokens.push(data.token);
            R20.initTokens();
            break;

        case 'TOKEN_DELETE':
            R20.tokens = R20.tokens.filter(t => t.id !== data.id);
            if (R20.selectedTokenId === data.id) R20.selectToken(null);
            R20.initTokens();
            break;

        case 'POLY_SYNC':
            R20.polygons = data.polygons || [];
            if (R20.renderPolygons) R20.renderPolygons();
            if (R20.updatePolygonsSidebar) R20.updatePolygonsSidebar();
            if (R20.updateVision) R20.updateVision();
            break;

        case 'INIT_SYNC':
            R20.initiativeList = data.list || [];
            R20.currentTurnIndex = data.currentTurnIndex || 0;
            R20.currentRound = data.currentRound || 1;
            if (R20.renderInitiative) R20.renderInitiative();
            break;

        case 'CHAT_MSG':
            // Stampa solo a schermo, NON rimanda in rete
            R20.addChatMessage(data.title, data.detail, data.total);
            break;

        case 'SCENE_LIGHT':
            R20.sceneLighting = data.lighting;
            const btnLight = document.getElementById('btn-scene-light');
            if (btnLight) {
                btnLight.innerText = R20.sceneLighting === 'bright' ? '☀️ Giorno' : '🌙 Buio';
                btnLight.className = R20.sceneLighting === 'bright' ? 'btn btn-warning' : 'btn';
            }
            if (R20.updateVision) R20.updateVision();
            break;
    }
};

// ============================================================================
// 2. GESTIONE PERMESSI & DOCK
// ============================================================================

R20.applyClientPermissions = function(role) {
    R20.myRole.canEdit = role.canEdit;
    R20.myRole.tokenControl = role.tokenControl;
