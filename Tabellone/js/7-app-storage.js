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

    const editTabBtn = document.querySelector(".tab-btn[onclick*='edit-tab']");
    if (editTabBtn) {
        editTabBtn.style.display = role.canEdit ? 'block' : 'none';
        if (!role.canEdit && document.getElementById('edit-tab').classList.contains('active')) {
            R20.switchTab('token-tab');
        }
    }

    R20.renderPlayersTabAndDock();
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

R20.renderPlayersTabAndDock = function() {
    const roleBadge = document.getElementById('players-my-role-badge');
    if (roleBadge) {
        if (R20.p2p.isHost) {
            roleBadge.innerHTML = `👑 Sei il <b>Master (Host)</b>: Controllo totale.`;
            roleBadge.style.borderLeftColor = "#f1c40f";
        } else {
            let tokName = "Tutte le Pedine";
            if (R20.myRole.tokenControl === 'none') tokName = "Spettatore (Nessuna)";
            else if (R20.myRole.tokenControl !== 'all') {
                const t = R20.tokens.find(tok => tok.id == R20.myRole.tokenControl);
                tokName = t ? t.name : 'Pedina #' + R20.myRole.tokenControl;
            }
            roleBadge.innerHTML = `📱 Sei un <b>Giocatore</b><br>Pedina: <b>${tokName}</b> | Mappa: <b>${R20.myRole.canEdit ? 'Modificabile' : 'Bloccata'}</b>`;
            roleBadge.style.borderLeftColor = "#00c3ff";
        }
    }

    const countEl = document.getElementById('players-online-count');
    const totalOnline = R20.p2p.isHost ? (R20.p2p.connections.length + 1) : (R20.p2p.hostConn ? 2 : 1);
    if (countEl) countEl.innerText = `${totalOnline} online`;

    const listContainer = document.getElementById('players-manager-list');
    if (listContainer) {
        let html = `
            <div class="player-manage-card">
                <div class="player-manage-header">
                    <span>👑 Master ${R20.p2p.isHost ? '(Tu)' : ''}</span>
                    <span style="color:#f1c40f; font-size:10px;">● Online</span>
                </div>
            </div>
        `;

        if (R20.p2p.isHost) {
            if (R20.p2p.connections.length === 0) {
                html += '<div style="font-size:11px; color:#888; margin-top:4px;">Nessun altro connesso. Clicca su "Copia Link Invito" per invitare un secondo schermo!</div>';
            } else {
                html += R20.p2p.connections.map((conn, idx) => {
                    const info = conn.playerInfo;
                    const tokenOpts = `
                        <option value="all" ${info.tokenControl === 'all' ? 'selected' : ''}>Tutte le pedine</option>
                        <option value="none" ${info.tokenControl === 'none' ? 'selected' : ''}>Nessuna (Spettatore)</option>
                        ${R20.tokens.map(t => `<option value="${t.id}" ${info.tokenControl == t.id ? 'selected' : ''}>Solo: ${t.name}</option>`).join('')}
                    `;

                    return `
                        <div class="player-manage-card">
                            <div class="player-manage-header">
                                <span>📱 ${info.name}</span>
                                <span style="color:#2ecc71; font-size:10px;">● Online</span>
                            </div>
                            <div style="display:flex; gap:6px; align-items:center; font-size:11px; margin-top:4px;">
                                <label>Pedina:</label>
                                <select onchange="R20.updatePlayerPerm(${idx}, 'tokenControl', this.value)" style="background:#111; color:#fff; border:1px solid #555; padding:2px; font-size:11px; flex:1;">
                                    ${tokenOpts}
                                </select>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; margin-top:2px;">
                                <span>Modifica Mappa:</span>
                                <button class="btn ${info.canEdit ? 'btn-success' : 'btn-danger'}" style="padding:2px 8px; font-size:10px;" onclick="R20.togglePlayerMapEdit(${idx})">
                                    ${info.canEdit ? 'Abilitata' : 'Bloccata'}
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } else {
            html += `
                <div class="player-manage-card">
                    <div class="player-manage-header">
                        <span>📱 Tu (Giocatore)</span>
                        <span style="color:#2ecc71; font-size:10px;">● Connesso</span>
                    </div>
                </div>
            `;
        }

        listContainer.innerHTML = html;
    }

    const dock = document.getElementById('players-bottom-dock');
    if (dock) {
        let dockHtml = `
            <div class="player-dock-chip is-master">
                <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#f1c40f;"></span>
                <span>Master</span>
            </div>
        `;

        if (R20.p2p.isHost) {
            dockHtml += R20.p2p.connections.map(conn => {
                let badgeColor = "#00c3ff";
                let assignedName = "Tutte";
                if (conn.playerInfo.tokenControl === 'none') assignedName = "Spettatore";
                else if (conn.playerInfo.tokenControl !== 'all') {
                    const t = R20.tokens.find(tok => tok.id == conn.playerInfo.tokenControl);
                    if (t) { assignedName = t.name; badgeColor = t.color; }
                }
                return `
                    <div class="player-dock-chip">
                        <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${badgeColor};"></span>
                        <span>${conn.playerInfo.name}</span>
                        <span style="color:#aaa; font-size:9px;">[${assignedName}]</span>
                    </div>
                `;
            }).join('');
        }
        dock.innerHTML = dockHtml;
    }
};

R20.updatePlayerPerm = function(connIdx, field, value) {
    const conn = R20.p2p.connections[connIdx];
    if (conn) {
        conn.playerInfo[field] = value;
        R20.sendPermissionsToClient(conn);
        R20.renderPlayersTabAndDock();
    }
};

R20.togglePlayerMapEdit = function(connIdx) {
    const conn = R20.p2p.connections[connIdx];
    if (conn) {
        conn.playerInfo.canEdit = !conn.playerInfo.canEdit;
        R20.sendPermissionsToClient(conn);
        R20.renderPlayersTabAndDock();
    }
};

// ============================================================================
// 3. AUTOSALVATAGGIO CONTINUO & BACKUP JSON
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
        version: 5,
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
// 4. ZOOM & SCHEDE UI
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
// 5. EVENTI GLOBALI & AVVIO (CON AUTOCARICAMENTO SICURO)
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
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

    const viewport = document.getElementById('viewport');
    if (viewport) {
        viewport.addEventListener('click', (e) => {
            if (R20.isEditMode) return;
            if (e.target.closest('.token') || e.target.closest('.bubble') || e.target.closest('.hp-popover') || e.target.closest('#zoom-widget') || e.target.closest('#players-bottom-dock')) {
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

    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
        if (!R20.selectedTokenId) return;

        const tok = R20.tokens.find(t => t.id === R20.selectedTokenId);
        if (!tok) return;

        if (!R20.canIControlToken(tok.id)) return;

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
                if (R20.updateVision) R20.updateVision();
                R20.broadcast({ type: 'TOKEN_MOVE', id: tok.id, x: tok.x, y: tok.y });
            } else {
                R20.triggerCollisionAlert(tok);
            }
        }
    });

    // Ricarica sessione precedente: se vuota, genera subito le pedine e la mappa di default!
    const saved = localStorage.getItem('roll20_scenario_save');
    let loaded = false;
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.tokens && parsed.tokens.length > 0) {
                R20.loadGameState(parsed, false);
                loaded = true;
            }
        } catch(e) {}
    }

    if (!loaded) {
        R20.tokens = R20.getDefaultTokens();
        R20.polygons = [
            {
                id: 101,
                name: "Muro Nord",
                layer: "Muro",
                blocksVision: true,
                passable: false,
                color: "#1c2229",
                texture: "mattoni",
                customTextureUrl: "",
                emitsLight: false,
                lightRadius: 0,
                lightColor: '#f39c12',
                points: [[200, 200], [550, 200], [550, 230], [200, 230]]
            },
            {
                id: 102,
                name: "Falò Centrale",
                layer: "Base",
                blocksVision: false,
                passable: true,
                color: "#e67e22",
                texture: "pietra",
                customTextureUrl: "",
                emitsLight: true,
                lightRadius: 280,
                lightColor: '#e67e22',
                points: [[130, 130], [170, 130], [170, 170], [130, 170]]
            }
        ];
        R20.initTokens();
    }

    R20.setZoom(1.0);
    R20.renderPlayersTabAndDock();

    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        R20.joinClientP2P(roomParam);
    }
});

window.addEventListener('beforeunload', () => {
    if (R20.p2p && R20.p2p.peer) {
        try { R20.p2p.peer.destroy(); } catch(e) {}
    }
});
