window.R20 = window.R20 || {};

R20.zoom = 1.0;

// Ruolo locale del dispositivo
R20.myRole = {
    isHost: false,
    canEdit: true,
    tokenControl: 'all' // 'all', 'none' oppure id pedina (es. 1)
};

R20.myClientId = 'usr_' + Math.random().toString(36).substring(2, 9);
R20.myPlayerName = localStorage.getItem('r20_player_name') || 'Giocatore ' + R20.myClientId.substring(4);

// Elenco giocatori collegati
R20.connectedUsers = new Map();

R20.net = {
    client: null,
    isHost: false,
    roomCode: null,
    topic: null
};

// ============================================================================
// 1. VERIFICA DEI PERMESSI LOCALI
// ============================================================================

R20.canIControlToken = function(tokenId) {
    if (R20.net.isHost) return true; // Il Master controlla sempre tutto
    if (R20.myRole.tokenControl === 'all') return true;
    if (R20.myRole.tokenControl === 'none') return false;
    return R20.myRole.tokenControl == tokenId;
};

// ============================================================================
// 2. RETE WEBSOCKET RESILIENTE (DOPPIO BROKER HIVEMQ + EMQX)
// ============================================================================

R20.openP2PModal = function() {
    document.getElementById('p2p-modal').style.display = 'flex';
    document.getElementById('p2p-host-room').value = localStorage.getItem('r20_last_room') || 'tavolo-dnd-' + Math.floor(100 + Math.random() * 900);
    document.getElementById('p2p-join-room').value = localStorage.getItem('r20_last_room') || '';
    if (R20.net.isHost) {
        R20.renderPlayersTabAndDock();
    }
};

R20.closeP2PModal = function() {
    document.getElementById('p2p-modal').style.display = 'none';
};

// Lista di server broker ridondati ad alta velocità
const BROKER_SERVERS = [
    { name: 'HiveMQ Europa', url: 'wss://broker.hivemq.com:8884/mqtt' },
    { name: 'EMQX Serverless', url: 'wss://broker.emqx.io:8084/mqtt' }
];

function connectBroker(roomCode, isHost, brokerIndex = 0) {
    const statusMsg = document.getElementById('p2p-status-msg');

    // 1. Verifica che la libreria MQTT sia effettivamente presente nel browser
    if (typeof mqtt === 'undefined') {
        if (statusMsg) {
            statusMsg.innerHTML = "❌ Libreria di rete non caricata!<br>Premi <b>Ctrl + F5</b> per forzare l'aggiornamento di Chrome.";
            statusMsg.style.color = "#e74c3c";
        }
        return;
    }

    if (brokerIndex >= BROKER_SERVERS.length) {
        if (statusMsg) {
            statusMsg.innerText = "❌ Impossibile raggiungere i server di rete. Controlla la connessione.";
            statusMsg.style.color = "#e74c3c";
        }
        return;
    }

    const currentBroker = BROKER_SERVERS[brokerIndex];
    if (statusMsg) {
        statusMsg.innerText = `⏳ Connessione a ${currentBroker.name}...`;
        statusMsg.style.color = "#f39c12";
    }

    if (R20.net.client) {
        try { R20.net.client.end(true); } catch(e) {}
    }

    const cleanRoom = roomCode.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const topic = `mrdnd2024/room/${cleanRoom}`;
    R20.net.roomCode = cleanRoom;
    R20.net.topic = topic;
    R20.net.isHost = isHost;
    R20.myRole.isHost = isHost;
    R20.connectedUsers.clear();

    localStorage.setItem('r20_last_room', cleanRoom);

    let isConnected = false;

    // Timeout di 4 secondi: se il server non risponde, prova automaticamente il server successivo
    const timeoutTimer = setTimeout(() => {
        if (!isConnected) {
            console.warn(`Timeout su ${currentBroker.name}, tentativo con il server di riserva...`);
            try { client.end(true); } catch(e) {}
            connectBroker(roomCode, isHost, brokerIndex + 1);
        }
    }, 4500);

    const client = mqtt.connect(currentBroker.url, {
        clientId: R20.myClientId,
        clean: true,
        connectTimeout: 4000,
        reconnectPeriod: 2500
    });

    R20.net.client = client;

    client.on('connect', () => {
        isConnected = true;
        clearTimeout(timeoutTimer);

        client.subscribe(topic, { qos: 0 }, (err) => {
            if (!err) {
                if (statusMsg) {
                    statusMsg.innerText = `✔ Connesso con successo (${currentBroker.name})!`;
                    statusMsg.style.color = "#2ecc71";
                }

                R20.connectedUsers.set(R20.myClientId, {
                    id: R20.myClientId,
                    name: isHost ? 'Master (Tu)' : R20.myPlayerName + ' (Tu)',
                    isHost: isHost,
                    canEdit: isHost ? true : R20.myRole.canEdit,
                    tokenControl: isHost ? 'all' : R20.myRole.tokenControl,
                    lastSeen: Date.now()
                });

                if (isHost) {
                    R20.updateP2PStatusBadge(`🟢 Host (${cleanRoom})`, "#2ecc71");
                    const btnCopy = document.getElementById('btn-copy-invite');
                    if (btnCopy) btnCopy.style.display = 'block';
                    R20.addChatMessage("Rete Live", `Stanza Master aperta: <b>${cleanRoom}</b>`);
                } else {
                    R20.updateP2PStatusBadge(`🟢 Connesso (${cleanRoom})`, "#00c3ff");
                    R20.addChatMessage("Rete Live", `Connesso alla stanza: <b>${cleanRoom}</b>`);
                }

                // Annuncio di presenza
                R20.broadcast({
                    type: 'HEARTBEAT',
                    user: {
                        id: R20.myClientId,
                        name: R20.myPlayerName,
                        isHost: isHost
                    }
                });

                if (!isHost) {
                    R20.broadcast({ type: 'REQUEST_FULL_SYNC', clientId: R20.myClientId });
                }

                R20.renderPlayersTabAndDock();
                setTimeout(R20.closeP2PModal, 700);
            }
        });
    });

    client.on('message', (receivedTopic, payload) => {
        try {
            const data = JSON.parse(payload.toString());
            if (data.senderId === R20.myClientId) return;
            R20.handleNetworkMessage(data);
        } catch(e) {
            console.error(e);
        }
    });

    client.on('error', (err) => {
        if (!isConnected) {
            clearTimeout(timeoutTimer);
            connectBroker(roomCode, isHost, brokerIndex + 1);
        }
    });
}

R20.startHostP2P = function() {
    const raw = document.getElementById('p2p-host-room').value.trim();
    if (!raw) return;
    connectBroker(raw, true, 0);
};

R20.joinClientP2P = function(roomOverride = null) {
    const raw = roomOverride || document.getElementById('p2p-join-room').value.trim();
    if (!raw) return;
    connectBroker(raw, false, 0);
};

R20.copyInviteLink = function() {
    const url = window.location.origin + window.location.pathname + '?room=' + encodeURIComponent(R20.net.roomCode);
    navigator.clipboard.writeText(url).then(() => {
        alert("Link copiato negli appunti!\nCondividilo con il cellulare o un altro browser:\n" + url);
    });
};

R20.updateP2PStatusBadge = function(text, color) {
    const btn = document.getElementById('btn-p2p-status');
    if (btn) {
        btn.innerText = text;
        btn.style.background = color;
    }
};

R20.broadcast = function(msg) {
    if (R20.net.client && R20.net.client.connected) {
        msg.senderId = R20.myClientId;
        R20.net.client.publish(R20.net.topic, JSON.stringify(msg));
        if (R20.net.isHost) R20.autoSave();
    }
};

// ============================================================================
// 3. GESTIONE DEI MESSAGGI LIVE
// ============================================================================

R20.handleNetworkMessage = function(data) {
    if (!data || !data.type) return;

    switch (data.type) {
        case 'HEARTBEAT': {
            const u = data.user;
            if (!R20.connectedUsers.has(u.id)) {
                R20.connectedUsers.set(u.id, {
                    id: u.id,
                    name: u.name,
                    isHost: u.isHost,
                    canEdit: false,
                    tokenControl: 'all',
                    lastSeen: Date.now()
                });
                R20.addChatMessage("Presenza", `👋 <b>${u.name}</b> è online.`);
            } else {
                const existing = R20.connectedUsers.get(u.id);
                existing.lastSeen = Date.now();
                existing.name = u.name;
            }
            R20.renderPlayersTabAndDock();
            break;
        }

        case 'REQUEST_FULL_SYNC': {
            if (R20.net.isHost) {
                const peerInfo = R20.connectedUsers.get(data.clientId) || { canEdit: false, tokenControl: 'all' };
                R20.broadcast({
                    type: 'FULL_SYNC',
                    targetClientId: data.clientId,
                    state: R20.getGameState(),
                    role: {
                        canEdit: peerInfo.canEdit,
                        tokenControl: peerInfo.tokenControl
                    }
                });
            }
            break;
        }

        case 'FULL_SYNC': {
            if (!R20.net.isHost && (data.targetClientId === R20.myClientId || !data.targetClientId)) {
                R20.loadGameState(data.state, false);
                if (data.role) R20.applyClientPermissions(data.role);
            }
            break;
        }

        case 'SET_PERMISSIONS': {
            if (data.targetClientId === R20.myClientId) {
                R20.applyClientPermissions(data.role);
            }
            const u = R20.connectedUsers.get(data.targetClientId);
            if (u) {
                u.canEdit = data.role.canEdit;
                u.tokenControl = data.role.tokenControl;
                R20.renderPlayersTabAndDock();
            }
            break;
        }

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
// 4. GESTIONE PERMESSI & DOCK ROLL20
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

R20.renderPlayersTabAndDock = function() {
    const roleBadge = document.getElementById('players-my-role-badge');
    if (roleBadge) {
        if (R20.net.isHost) {
            roleBadge.innerHTML = `👑 Sei il <b>Master (Host)</b>: Hai il controllo completo su tutto.`;
            roleBadge.style.borderLeftColor = "#f1c40f";
        } else {
            let tokName = "Tutte le Pedine";
            if (R20.myRole.tokenControl === 'none') tokName = "Nessuna (Solo Spettatore)";
            else if (R20.myRole.tokenControl !== 'all') {
                const t = R20.tokens.find(tok => tok.id == R20.myRole.tokenControl);
                tokName = t ? t.name : 'Pedina #' + R20.myRole.tokenControl;
            }
            roleBadge.innerHTML = `📱 Sei un <b>Giocatore</b><br>Pedina: <b>${tokName}</b> | Mappa: <b>${R20.myRole.canEdit ? 'Modificabile' : 'Bloccata'}</b>`;
            roleBadge.style.borderLeftColor = "#00c3ff";
        }
    }

    const countEl = document.getElementById('players-online-count');
    if (countEl) countEl.innerText = `${R20.connectedUsers.size} connessi`;

    const listContainer = document.getElementById('players-manager-list');
    if (listContainer) {
        const users = Array.from(R20.connectedUsers.values());

        listContainer.innerHTML = users.map(u => {
            const isMe = u.id === R20.myClientId;

            const tokenOpts = `
                <option value="all" ${u.tokenControl === 'all' ? 'selected' : ''}>Tutte le pedine</option>
                <option value="none" ${u.tokenControl === 'none' ? 'selected' : ''}>Nessuna (Spettatore)</option>
                ${R20.tokens.map(t => `<option value="${t.id}" ${u.tokenControl == t.id ? 'selected' : ''}>Solo: ${t.name}</option>`).join('')}
            `;

            return `
                <div class="player-manage-card">
                    <div class="player-manage-header">
                        <span>${u.isHost ? '👑' : '📱'} ${u.name} ${isMe ? '(Tu)' : ''}</span>
                        <span style="color:${u.isHost ? '#f1c40f' : '#2ecc71'}; font-size:10px;">● Online</span>
                    </div>

                    ${R20.net.isHost && !isMe ? `
                        <div style="display:flex; gap:6px; align-items:center; font-size:11px; margin-top:4px;">
                            <label>Pedina:</label>
                            <select onchange="R20.changeUserTokenControl('${u.id}', this.value)" style="background:#111; color:#fff; border:1px solid #555; padding:2px; font-size:11px; flex:1;">
                                ${tokenOpts}
                            </select>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; margin-top:2px;">
                            <span>Modifica Mappa:</span>
                            <button class="btn ${u.canEdit ? 'btn-success' : 'btn-danger'}" style="padding:2px 8px; font-size:10px;" onclick="R20.toggleUserMapEdit('${u.id}')">
                                ${u.canEdit ? 'Abilitata' : 'Bloccata'}
                            </button>
                        </div>
                    ` : `
                        <div style="font-size:11px; color:#aaa;">
                            Controllo: <b>${u.tokenControl === 'all' ? 'Tutte' : (u.tokenControl === 'none' ? 'Spettatore' : 'Pedina specifica')}</b>
                            | Mappa: <b>${u.canEdit ? 'Sì' : 'No'}</b>
                        </div>
                    `}
                </div>
            `;
        }).join('');
    }

    const dock = document.getElementById('players-bottom-dock');
    if (dock) {
        dock.innerHTML = Array.from(R20.connectedUsers.values()).map(u => {
            let badgeColor = "#00c3ff";
            let assignedName = "Tutte";
            if (u.tokenControl === 'none') assignedName = "Spettatore";
            else if (u.tokenControl !== 'all') {
                const t = R20.tokens.find(tok => tok.id == u.tokenControl);
                if (t) { assignedName = t.name; badgeColor = t.color; }
            }
            return `
                <div class="player-dock-chip ${u.isHost ? 'is-master' : ''}">
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${badgeColor};"></span>
                    <span>${u.name}</span>
                    <span style="color:#aaa; font-size:9px;">[${assignedName}]</span>
                </div>
            `;
        }).join('');
    }
};

R20.changeUserTokenControl = function(targetClientId, tokenControlValue) {
    const u = R20.connectedUsers.get(targetClientId);
    if (!u) return;

    u.tokenControl = tokenControlValue;
    R20.broadcast({
        type: 'SET_PERMISSIONS',
        targetClientId: targetClientId,
        role: {
            canEdit: u.canEdit,
            tokenControl: u.tokenControl
        }
    });
    R20.renderPlayersTabAndDock();
};

R20.toggleUserMapEdit = function(targetClientId) {
    const u = R20.connectedUsers.get(targetClientId);
    if (!u) return;

    u.canEdit = !u.canEdit;
    R20.broadcast({
        type: 'SET_PERMISSIONS',
        targetClientId: targetClientId,
        role: {
            canEdit: u.canEdit,
            tokenControl: u.tokenControl
        }
    });
    R20.renderPlayersTabAndDock();
};

// Heartbeat di presenza ogni 3 secondi
setInterval(() => {
    if (R20.net.client && R20.net.client.connected) {
        R20.broadcast({
            type: 'HEARTBEAT',
            user: {
                id: R20.myClientId,
                name: R20.myRole.isHost ? 'Master' : R20.myPlayerName,
                isHost: R20.myRole.isHost
            }
        });

        const now = Date.now();
        let changed = false;
        R20.connectedUsers.forEach((u, id) => {
            if (id !== R20.myClientId && (now - u.lastSeen > 9000)) {
                R20.connectedUsers.delete(id);
                changed = true;
            }
        });
        if (changed) R20.renderPlayersTabAndDock();
    }
}, 3000);

// ============================================================================
// 5. AUTOSALVATAGGIO CONTINUO & BACKUP JSON
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
// 6. ZOOM & SCHEDE UI
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
// 7. EVENTI GLOBALI & AVVIO
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
                R20.updateVision();
                R20.broadcast({ type: 'TOKEN_MOVE', id: tok.id, x: tok.x, y: tok.y });
            } else {
                R20.triggerCollisionAlert(tok);
            }
        }
    });

    // Ricarica sessione salvata
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
    R20.renderPlayersTabAndDock();

    // Connessione automatica con link ?room=...
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        R20.addChatMessage("Rete Live", `Connessione automatica alla stanza: <b>${roomParam}</b>...`);
        R20.joinClientP2P(roomParam);
    }
});
