window.R20 = window.R20 || {};

R20.tokens = [];
R20.selectedTokenId = null;

R20.STATUSES = ['💀', '🩸', '🔥', '🛡️', '⚡', '💤', '🏹', '👁️', '❄️', '☣️', '⭐', '🔗', '⏳', '❌'];

R20.canIControlToken = function(tokenId) {
    if (!R20.myRole) return true;
    if (R20.p2p && R20.p2p.isHost) return true;
    if (R20.myRole.isHost) return true;
    if (R20.myRole.tokenControl === 'all') return true;
    if (R20.myRole.tokenControl === 'none') return false;
    return R20.myRole.tokenControl == tokenId;
};

R20.getDefaultTokens = function() {
    return [
        R20.makeToken(1, 'Guerriero', 'G', 32, 32, 16, '#c0392b', 150, 250, [
            { id: 101, name: 'Spada Lunga', hitFormula: '1d20+6', damageFormula: '1d8+4', count: 0 },
            { id: 102, name: 'Giavellotto', hitFormula: '1d20+5', damageFormula: '1d6+3', count: 0 }
        ], '1d20+2', 350, false, 0, 1, ''),
        R20.makeToken(2, 'Mago', 'M', 18, 18, 12, '#8e44ad', 350, 300, [
            { id: 201, name: 'Dardo di Fuoco', hitFormula: '1d20+5', damageFormula: '1d10', count: 0 },
            { id: 202, name: 'Pugnale', hitFormula: '1d20+3', damageFormula: '1d4+1', count: 0 }
        ], '1d20+3', 350, true, 320, 1, ''),
        R20.makeToken(3, 'Goblin', 'g', 12, 12, 13, '#27ae60', 425, 120, [
            { id: 301, name: 'Scimitarra', hitFormula: '1d20+4', damageFormula: '1d6+2', count: 0 },
            { id: 302, name: 'Arco Corto', hitFormula: '1d20+4', damageFormula: '1d6+2', count: 0 }
        ], '1d20+2', 300, true, 250, 1, '')
    ];
};
// Nel costruttore makeToken: default visionRadius = 3000
R20.makeToken = function(id, name, symbol, hp, maxHp, ac, color, x, y, attacks, initBonus = '1d20+2', visionRadius = 3000, hasDarkvision = false, darkvisionRange = 300, size = 1, imgUrl = '') {
    return {
        id, name, symbol, hp, maxHp, ac, color, x, y,
        size: Math.max(1, parseInt(size) || 1),
        imgUrl: imgUrl || '',
        initBonus,
        attacks: attacks || [
            { id: Date.now(), name: 'Attacco', hitFormula: '1d20+4', damageFormula: '1d6+2', count: 0 }
        ],
        visionRadius: visionRadius || 3000, // Valore normale 3000px
        hasDarkvision,
        darkvisionRange,
        statuses: new Set(),
        el: null
    };
};

// Nelle pedine di default (Guerriero, Mago, Goblin): visionRadius = 3000
R20.getDefaultTokens = function() {
    return [
        R20.makeToken(1, 'Guerriero', 'G', 32, 32, 16, '#c0392b', 150, 250, [
            { id: 101, name: 'Spada Lunga', hitFormula: '1d20+6', damageFormula: '1d8+4', count: 0 },
            { id: 102, name: 'Giavellotto', hitFormula: '1d20+5', damageFormula: '1d6+3', count: 0 }
        ], '1d20+2', 3000, false, 0, 1, ''),
        R20.makeToken(2, 'Mago', 'M', 18, 18, 12, '#8e44ad', 350, 300, [
            { id: 201, name: 'Dardo di Fuoco', hitFormula: '1d20+5', damageFormula: '1d10', count: 0 },
            { id: 202, name: 'Pugnale', hitFormula: '1d20+3', damageFormula: '1d4+1', count: 0 }
        ], '1d20+3', 3000, true, 320, 1, ''),
        R20.makeToken(3, 'Goblin', 'g', 12, 12, 13, '#27ae60', 425, 120, [
            { id: 301, name: 'Scimitarra', hitFormula: '1d20+4', damageFormula: '1d6+2', count: 0 },
            { id: 302, name: 'Arco Corto', hitFormula: '1d20+4', damageFormula: '1d6+2', count: 0 }
        ], '1d20+2', 3000, true, 250, 1, '')
    ];
};

// Nella creazione di nuove pedine (spawnToken): visionRadius = 3000
R20.spawnToken = function() {
    if (R20.myRole && !R20.myRole.isHost && R20.myRole.tokenControl === 'none') {
        alert("Non hai i permessi per aggiungere nuove pedine al tavolo!");
        return;
    }

    const id = Date.now();
    const colors = ['#e67e22', '#16a085', '#2980b9', '#8e44ad', '#d35400'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const tok = R20.makeToken(id, `Personaggio ${R20.tokens.length + 1}`, 'P', 25, 25, 14, color, 200, 350, [
        { id: Date.now(), name: 'Spada Corta', hitFormula: '1d20+4', damageFormula: '1d6+2', count: 0 }
    ], '1d20+2', 3000, false, 0, 1, '');

    R20.tokens.push(tok);
    R20.initTokens();
    R20.selectToken(id);

    if (R20.broadcast) {
        R20.broadcast({
            type: 'TOKEN_SPAWN',
            token: { ...tok, statuses: Array.from(tok.statuses), el: null }
        });
    }
};


R20.initTokens = function() {
    const container = document.getElementById('tokens-container');
    if (!container) return;
    container.innerHTML = '';

    R20.tokens.forEach(tok => {
        const el = document.createElement('div');
        el.className = 'token';
        el.id = `token-${tok.id}`;
        tok.el = el;

        el.innerHTML = `
            <div class="roll20-bubbles">
                <div class="bubble bubble-hp" title="Modifica HP">${tok.hp}</div>
                <div class="bubble bubble-ac" title="Classe Armatura">${tok.ac}</div>
            </div>
            <div class="hp-popover">
                <input type="text" placeholder="+10 o -5" />
            </div>
            <div class="token-hp-bar-wrap">
                <div class="token-hp-bar"></div>
            </div>
            <div class="token-avatar" style="background-color: ${tok.color};">
                ${tok.imgUrl ? `<img src="${tok.imgUrl}" alt="${tok.name}">` : tok.symbol}
            </div>
            <div class="token-name">${tok.name}</div>
            <div class="token-statuses"></div>
        `;

        container.appendChild(el);
        R20.setupTokenEvents(tok);
        R20.updateTokenVisuals(tok);
    });

    if (R20.renderPolygons) R20.renderPolygons();
    if (R20.updatePolygonsSidebar) R20.updatePolygonsSidebar();
    if (R20.updateVision) R20.updateVision();
    R20.renderTokenListView();
    if (R20.renderInitiative) R20.renderInitiative();
    if (R20.renderPlayersTabAndDock) R20.renderPlayersTabAndDock();
};

R20.updateTokenVisuals = function(tok) {
    const el = tok.el;
    if (!el) return;

    const span = tok.size * R20.GRID_SIZE;
    el.style.width = `${span}px`;
    el.style.height = `${span}px`;
    el.style.left = `${tok.x}px`;
    el.style.top = `${tok.y}px`;
    el.classList.toggle('selected', tok.id === R20.selectedTokenId);

    const nameEl = el.querySelector('.token-name');
    if (nameEl) nameEl.innerText = tok.name;

    const avatar = el.querySelector('.token-avatar');
    if (avatar) {
        avatar.style.backgroundColor = tok.color;
        avatar.innerHTML = tok.imgUrl ? `<img src="${tok.imgUrl}" alt="${tok.name}">` : tok.symbol;
    }

    const hpBubble = el.querySelector('.bubble-hp');
    if (hpBubble) hpBubble.innerText = tok.hp;

    const acBubble = el.querySelector('.bubble-ac');
    if (acBubble) acBubble.innerText = tok.ac;

    const percent = Math.max(0, Math.min(100, (tok.hp / tok.maxHp) * 100));
    const bar = el.querySelector('.token-hp-bar');
    if (bar) {
        bar.style.width = `${percent}%`;
        bar.style.backgroundColor = percent > 50 ? '#2ecc71' : percent > 25 ? '#f39c12' : '#e74c3c';
    }

    const statusesEl = el.querySelector('.token-statuses');
    if (statusesEl) {
        statusesEl.innerHTML = Array.from(tok.statuses).map(s => `<span class="status-badge">${s}</span>`).join('');
    }
};

R20.setupTokenEvents = function(tok) {
    const el = tok.el;
    let isDragging = false;
    let startDragX = 0, startDragY = 0;
    let origX = 0, origY = 0;

    const hpBubble = el.querySelector('.bubble-hp');
    const hpPopover = el.querySelector('.hp-popover');
    const hpInput = hpPopover ? hpPopover.querySelector('input') : null;

    if (hpBubble && hpPopover && hpInput) {
        hpBubble.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!R20.canIControlToken(tok.id)) {
                alert("Non puoi modificare i punti ferita di questa pedina!");
                return;
            }
            R20.selectToken(tok.id);
            hpPopover.style.display = 'block';
            hpInput.value = '';
            hpInput.focus();
        });

        hpInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                R20.applyHpMath(tok, hpInput.value);
                hpPopover.style.display = 'none';
            } else if (e.key === 'Escape') {
                hpPopover.style.display = 'none';
            }
        });

        hpInput.addEventListener('blur', () => { hpPopover.style.display = 'none'; });
    }

    el.addEventListener('pointerdown', (e) => {
        if (R20.isEditMode) return;
        if (e.target.closest('.bubble') || e.target.closest('.hp-popover')) return;

        if (!R20.canIControlToken(tok.id)) return;

        R20.selectToken(tok.id);
        isDragging = true;
        el.classList.add('dragging');
        origX = tok.x;
        origY = tok.y;

        const coords = R20.getBoardCoords(e);
        startDragX = coords.x - tok.x;
        startDragY = coords.y - tok.y;

        el.setPointerCapture(e.pointerId);
        e.stopPropagation();
    });

    el.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const coords = R20.getBoardCoords(e);
        tok.x = coords.x - startDragX;
        tok.y = coords.y - startDragY;
        el.style.left = `${tok.x}px`;
        el.style.top = `${tok.y}px`;
        if (R20.updateVision) R20.updateVision();
    });

    el.addEventListener('pointerup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        el.classList.remove('dragging');
        el.releasePointerCapture(e.pointerId);

        const targetX = Math.max(0, Math.round(tok.x / R20.GRID_SIZE) * R20.GRID_SIZE);
        const targetY = Math.max(0, Math.round(tok.y / R20.GRID_SIZE) * R20.GRID_SIZE);

        if (R20.canTokenMoveTo(targetX, targetY, tok.size)) {
            tok.x = targetX;
            tok.y = targetY;
        } else {
            tok.x = origX;
            tok.y = origY;
            R20.triggerCollisionAlert(tok);
        }

        R20.updateTokenVisuals(tok);
        if (R20.updateVision) R20.updateVision();

        if (R20.broadcast) {
            R20.broadcast({ type: 'TOKEN_MOVE', id: tok.id, x: tok.x, y: tok.y });
        }
    });
};

R20.triggerCollisionAlert = function(tok) {
    if (tok && tok.el) {
        tok.el.classList.remove('collision-flash');
        void tok.el.offsetWidth;
        tok.el.classList.add('collision-flash');
    }
};

R20.selectToken = function(id) {
    R20.selectedTokenId = id;
    R20.tokens.forEach(t => R20.updateTokenVisuals(t));
    if (R20.updateVision) R20.updateVision();

    const tok = R20.tokens.find(t => t.id === id);
    const listView = document.getElementById('token-list-view');
    const editorBody = document.getElementById('token-editor-body');

    if (tok) {
        if (listView) listView.style.display = 'none';
        if (editorBody) editorBody.style.display = 'block';
        R20.fillTokenEditor(tok);
    } else {
        if (editorBody) editorBody.style.display = 'none';
        if (listView) listView.style.display = 'block';
        R20.renderTokenListView();
    }
    if (R20.renderInitiative) R20.renderInitiative();
};

R20.renderTokenListView = function() {
    const countEl = document.getElementById('token-count');
    if (countEl) countEl.innerText = R20.tokens.length;
    const container = document.getElementById('tokens-roster');
    if (!container) return;

    container.innerHTML = R20.tokens.map(tok => `
        <div class="token-roster-item" onclick="R20.selectToken(${tok.id})">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display:inline-block; width:28px; height:28px; border-radius:50%; background:${tok.color}; text-align:center; font-size:12px; font-weight:bold; line-height:28px; color:white; overflow:hidden;">
                    ${tok.imgUrl ? `<img src="${tok.imgUrl}" style="width:100%;height:100%;object-fit:cover;">` : tok.symbol}
                </span>
                <div>
                    <div style="font-weight: bold; font-size: 13px;">${tok.name} (${tok.size}x${tok.size})</div>
                    <div style="font-size: 11px; color: #aaa;">
                        HP: ${tok.hp}/${tok.maxHp} | CA: ${tok.ac} | Iniz: ${tok.initBonus || '1d20+2'}
                        ${tok.hasDarkvision ? ' | 👁️ Scurovis.' : ''}
                    </div>
                </div>
            </div>
            <div style="display: flex; gap: 2px;">
                ${Array.from(tok.statuses).map(s => `<span style="font-size:12px;">${s}</span>`).join('')}
            </div>
        </div>
    `).join('');
};

R20.fillTokenEditor = function(tok) {
    const titleEl = document.getElementById('token-title');
    if (titleEl) titleEl.innerHTML = `Selezionato: <b>${tok.name}</b>`;

    const nameInput = document.getElementById('edit-name');
    if (nameInput) nameInput.value = tok.name;

    const symbolInput = document.getElementById('edit-symbol');
    if (symbolInput) symbolInput.value = tok.symbol;

    const colorInput = document.getElementById('edit-color');
    if (colorInput) colorInput.value = tok.color;

    const sizeInput = document.getElementById('edit-size');
    if (sizeInput) sizeInput.value = tok.size || 1;

    const hpInput = document.getElementById('edit-hp');
    if (hpInput) hpInput.value = tok.hp;

    const maxHpInput = document.getElementById('edit-maxhp');
    if (maxHpInput) maxHpInput.value = tok.maxHp;

    const acInput = document.getElementById('edit-ac');
    if (acInput) acInput.value = tok.ac;

    const initInput = document.getElementById('edit-init-mod');
    if (initInput) initInput.value = tok.initBonus || '1d20+2';

    const visRange = document.getElementById('edit-vision-range');
    if (visRange) visRange.value = tok.visionRadius;

    const darkVis = document.getElementById('edit-darkvision');
    if (darkVis) darkVis.value = tok.hasDarkvision ? 'yes' : 'no';

    const darkRange = document.getElementById('edit-darkvision-range');
    if (darkRange) darkRange.value = tok.darkvisionRange;

    R20.renderTokenAttacksList(tok);

    const picker = document.getElementById('status-picker');
    if (picker) {
        const buttons = picker.children;
        for (let i = 0; i < buttons.length; i++) {
            const icon = buttons[i].innerText;
            buttons[i].classList.toggle('active', tok.statuses.has(icon));
        }
    }
};

R20.updateCurrentTokenProps = function() {
    const tok = R20.tokens.find(t => t.id === R20.selectedTokenId);
    if (!tok) return;

    if (!R20.canIControlToken(tok.id)) {
        alert("Non hai i permessi per modificare questa pedina!");
        return;
    }

    tok.name = document.getElementById('edit-name').value || 'Senza Nome';
    tok.symbol = document.getElementById('edit-symbol').value || tok.name[0];
    tok.color = document.getElementById('edit-color').value;
    tok.size = Math.max(1, parseInt(document.getElementById('edit-size').value) || 1);

    tok.maxHp = Math.max(1, parseInt(document.getElementById('edit-maxhp').value) || 1);
    tok.hp = Math.max(0, parseInt(document.getElementById('edit-hp').value) || 0);
    tok.ac = parseInt(document.getElementById('edit-ac').value) || 10;
    tok.initBonus = document.getElementById('edit-init-mod').value || '1d20+2';

    tok.visionRadius = Math.max(50, parseInt(document.getElementById('edit-vision-range').value) || 300);
    tok.hasDarkvision = document.getElementById('edit-darkvision').value === 'yes';
    tok.darkvisionRange = Math.max(0, parseInt(document.getElementById('edit-darkvision-range').value) || 0);

    R20.updateTokenVisuals(tok);
    if (R20.renderInitiative) R20.renderInitiative();
    if (R20.updateVision) R20.updateVision();

    if (R20.broadcast) {
        R20.broadcast({
            type: 'TOKEN_UPDATE_ALL',
            token: { ...tok, statuses: Array.from(tok.statuses), el: null }
        });
    }
};

R20.handleTokenImageUpload = function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const tok = R20.tokens.find(t => t.id === R20.selectedTokenId);
    if (!tok || !R20.canIControlToken(tok.id)) {
        alert("Non puoi modificare l'immagine di questa pedina!");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
        tok.imgUrl = evt.target.result;
        R20.updateTokenVisuals(tok);
        R20.renderTokenListView();
        if (R20.broadcast) {
            R20.broadcast({
                type: 'TOKEN_UPDATE_ALL',
                token: { ...tok, statuses: Array.from(tok.statuses), el: null }
            });
        }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
};

R20.removeTokenImage = function() {
    const tok = R20.tokens.find(t => t.id === R20.selectedTokenId);
    if (!tok || !R20.canIControlToken(tok.id)) return;

    tok.imgUrl = '';
    R20.updateTokenVisuals(tok);
    R20.renderTokenListView();
    if (R20.broadcast) {
        R20.broadcast({
            type: 'TOKEN_UPDATE_ALL',
            token: { ...tok, statuses: Array.from(tok.statuses), el: null }
        });
    }
};

R20.applyHpMath = function(tok, str) {
    if (!R20.canIControlToken(tok.id)) return;

    str = str.trim();
    if (!str) return;

    const firstChar = str[0];
    const numVal = parseInt(str.substring(1), 10);
    const directVal = parseInt(str, 10);

    if (firstChar === '+' && !isNaN(numVal)) {
        tok.hp = Math.min(tok.maxHp, tok.hp + numVal);
    } else if (firstChar === '-' && !isNaN(numVal)) {
        tok.hp = Math.max(0, tok.hp - numVal);
    } else if (!isNaN(directVal)) {
        tok.hp = Math.max(0, directVal);
    }

    R20.updateTokenVisuals(tok);
    R20.fillTokenEditor(tok);
    R20.renderTokenListView();
    if (R20.addChatMessage) R20.addChatMessage("Salute", `<b>${tok.name}</b> HP: <b>${tok.hp}/${tok.maxHp}</b> (${str})`);

    if (R20.broadcast) {
        R20.broadcast({ type: 'TOKEN_HP', id: tok.id, hp: tok.hp });
    }
};

R20.renderTokenAttacksList = function(tok) {
    const container = document.getElementById('token-attacks-list');
    if (!container) return;

    if (!tok.attacks || tok.attacks.length === 0) {
        container.innerHTML = '<div style="font-size:11px; color:#888; font-style:italic;">Nessun attacco configurato.</div>';
        return;
    }

    container.innerHTML = tok.attacks.map(atk => `
        <div class="attack-card">
            <div class="attack-card-inputs">
                <input type="text" placeholder="Nome" value="${atk.name}" title="Nome Attacco"
                       oninput="R20.updateAttackField(${tok.id}, ${atk.id}, 'name', this.value)">
                <input type="text" placeholder="1d20+4" value="${atk.hitFormula || ''}" title="Tiro per Colpire / TxC"
                       style="text-align:center;" oninput="R20.updateAttackField(${tok.id}, ${atk.id}, 'hitFormula', this.value)">
                <input type="text" placeholder="1d8+3" value="${atk.damageFormula || ''}" title="Tiro Danni"
                       style="text-align:center;" oninput="R20.updateAttackField(${tok.id}, ${atk.id}, 'damageFormula', this.value)">
                <button class="btn btn-danger" style="padding:2px 4px; font-size:11px;" title="Rimuovi attacco"
                        onclick="R20.removeAttackFromToken(${tok.id}, ${atk.id})">✖</button>
            </div>
            <div class="attack-card-actions">
                <button class="btn-run-attack" onclick="R20.executeSpecificAttack(${tok.id}, ${atk.id})">
                    ⚔️ ${atk.name || 'Attacca'} (${atk.hitFormula || '1d20'} | ${atk.damageFormula || '0'})
                </button>
                <span class="attack-counter-badge" title="Doppio clic per azzerare il contatore"
                      onclick="event.stopPropagation()"
                      ondblclick="R20.resetAttackCounter(event, ${tok.id}, ${atk.id})">
                    🎯 ${atk.count || 0}
                </span>
            </div>
        </div>
    `).join('');
};

R20.addNewAttackToCurrentToken = function() {
    const tok = R20.tokens.find(t => t.id === R20.selectedTokenId);
    if (!tok || !R20.canIControlToken(tok.id)) return;

    if (!tok.attacks) tok.attacks = [];
    tok.attacks.push({
        id: Date.now(),
        name: `Attacco ${tok.attacks.length + 1}`,
        hitFormula: '1d20+4',
        damageFormula: '1d6+2',
        count: 0
    });

    R20.renderTokenAttacksList(tok);
    if (R20.broadcast) {
        R20.broadcast({
            type: 'TOKEN_UPDATE_ALL',
            token: { ...tok, statuses: Array.from(tok.statuses), el: null }
        });
    }
};

R20.removeAttackFromToken = function(tokId, atkId) {
    const tok = R20.tokens.find(t => t.id === tokId);
    if (!tok || !R20.canIControlToken(tok.id)) return;

    tok.attacks = tok.attacks.filter(a => a.id !== atkId);
    R20.renderTokenAttacksList(tok);
    if (R20.broadcast) {
        R20.broadcast({
            type: 'TOKEN_UPDATE_ALL',
            token: { ...tok, statuses: Array.from(tok.statuses), el: null }
        });
    }
};

R20.updateAttackField = function(tokId, atkId, field, value) {
    const tok = R20.tokens.find(t => t.id === tokId);
    if (!tok || !R20.canIControlToken(tok.id)) return;

    const atk = tok.attacks.find(a => a.id === atkId);
    if (!atk) return;

    atk[field] = value;
    if (R20.broadcast) {
        R20.broadcast({
            type: 'TOKEN_UPDATE_ALL',
            token: { ...tok, statuses: Array.from(tok.statuses), el: null }
        });
    }
};

R20.executeSpecificAttack = function(tokId, atkId) {
    const tok = R20.tokens.find(t => t.id === tokId);
    if (!tok || !R20.canIControlToken(tokId)) return;

    const atk = tok.attacks.find(a => a.id === atkId);
    if (!atk) return;

    atk.count = (atk.count || 0) + 1;
    R20.renderTokenAttacksList(tok);

    let detail = '';
    let mainTotal = null;

    if (atk.hitFormula && atk.hitFormula.trim() !== '') {
        let formula = atk.hitFormula.trim();
        if (!formula.toLowerCase().includes('d')) {
            formula = formula.startsWith('+') || formula.startsWith('-') ? `1d20${formula}` : `1d20+${formula}`;
        }
        const hitRes = R20.evaluateDiceFormula(formula);
        detail += `<div>Tiro TxC (${formula}): ${hitRes.breakdown} = <b>${hitRes.total}</b></div>`;
        mainTotal = hitRes.total;
    }

    if (atk.damageFormula && atk.damageFormula.trim() !== '') {
        const dmgRes = R20.evaluateDiceFormula(atk.damageFormula.trim());
        detail += `<div>Tiro Danni (${atk.damageFormula}): ${dmgRes.breakdown} = <b>${dmgRes.total}</b></div>`;
        if (mainTotal === null) mainTotal = dmgRes.total;
    }

    detail += `<div style="font-size:10px; color:#888; margin-top:2px;">Esecuzioni: <b>${atk.count}</b></div>`;
    const atkTitle = `⚔️ ${tok.name} usa ${atk.name || 'Attacco'}`;
    if (R20.addChatMessage) R20.addChatMessage(atkTitle, detail, mainTotal);
    if (R20.switchTab) R20.switchTab('chat-tab');

    if (R20.broadcast) {
        R20.broadcast({ type: 'CHAT_MSG', title: atkTitle, detail, total: mainTotal });
        R20.broadcast({
            type: 'TOKEN_UPDATE_ALL',
            token: { ...tok, statuses: Array.from(tok.statuses), el: null }
        });
    }
};

R20.resetAttackCounter = function(e, tokId, atkId) {
    e.stopPropagation();
    const tok = R20.tokens.find(t => t.id === tokId);
    if (!tok || !R20.canIControlToken(tok.id)) return;

    const atk = tok.attacks.find(a => a.id === atkId);
    if (!atk) return;

    atk.count = 0;
    R20.renderTokenAttacksList(tok);
    const msg = `Il contatore di <b>${atk.name}</b> (${tok.name}) è stato azzerato.`;
    if (R20.addChatMessage) R20.addChatMessage("Contatore Azzerato", msg);

    if (R20.broadcast) {
        R20.broadcast({ type: 'CHAT_MSG', title: "Contatore Azzerato", detail: msg, total: null });
        R20.broadcast({
            type: 'TOKEN_UPDATE_ALL',
            token: { ...tok, statuses: Array.from(tok.statuses), el: null }
        });
    }
};

R20.toggleStatus = function(icon) {
    const tok = R20.tokens.find(t => t.id === R20.selectedTokenId);
    if (!tok || !R20.canIControlToken(tok.id)) return;

    if (tok.statuses.has(icon)) tok.statuses.delete(icon);
    else tok.statuses.add(icon);

    R20.updateTokenVisuals(tok);
    R20.fillTokenEditor(tok);

    if (R20.broadcast) {
        R20.broadcast({
            type: 'TOKEN_UPDATE_ALL',
            token: { ...tok, statuses: Array.from(tok.statuses), el: null }
        });
    }
};

R20.deleteCurrentToken = function() {
    if (!R20.selectedTokenId) return;
    const tok = R20.tokens.find(t => t.id === R20.selectedTokenId);
    if (!tok || !R20.canIControlToken(tok.id)) {
        alert("Non hai i permessi per eliminare questa pedina!");
        return;
    }

    const delId = R20.selectedTokenId;
    const idx = R20.tokens.findIndex(t => t.id === delId);
    if (idx !== -1) {
        R20.tokens[idx].el.remove();
        R20.tokens.splice(idx, 1);
    }
    if (R20.removeFromInit) R20.removeFromInit(delId);
    R20.selectToken(null);

    if (R20.broadcast) {
        R20.broadcast({ type: 'TOKEN_DELETE', id: delId });
    }
};
