window.R20 = window.R20 || {};

R20.tokens = [];
R20.selectedTokenId = null;

R20.STATUSES = ['💀', '🩸', '🔥', '🛡️', '⚡', '💤', '🏹', '👁️', '❄️', '☣️', '⭐', '🔗', '⏳', '❌'];

R20.makeToken = function(id, name, symbol, hp, maxHp, ac, color, x, y, attacks, initBonus = '1d20+2', visionRadius = 350, hasDarkvision = false, darkvisionRange = 300, size = 1, imgUrl = '') {
    return {
        id, name, symbol, hp, maxHp, ac, color, x, y,
        size: Math.max(1, parseInt(size) || 1), // 1=Media(1x1), 2=Grande(2x2), 3=Enorme(3x3), 4=Mastodontica(4x4)
        imgUrl: imgUrl || '',                   // Immagine personalizzata Base64 o URL
        initBonus,
        attacks: attacks || [
            { id: Date.now(), name: 'Spada Lunga', hitFormula: '1d20+5', damageFormula: '1d8+3', count: 0 }
        ],
        visionRadius, hasDarkvision, darkvisionRange,
        statuses: new Set(),
        el: null
    };
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

    R20.renderPolygons();
    R20.updatePolygonsSidebar();
    R20.updateVision();
    R20.renderTokenListView();
    R20.renderInitiative();
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

    el.querySelector('.token-name').innerText = tok.name;
    const avatar = el.querySelector('.token-avatar');
    avatar.style.backgroundColor = tok.color;
    avatar.innerHTML = tok.imgUrl ? `<img src="${tok.imgUrl}" alt="${tok.name}">` : tok.symbol;

    el.querySelector('.bubble-hp').innerText = tok.hp;
    el.querySelector('.bubble-ac').innerText = tok.ac;

    const percent = Math.max(0, Math.min(100, (tok.hp / tok.maxHp) * 100));
    const bar = el.querySelector('.token-hp-bar');
    bar.style.width = `${percent}%`;
    bar.style.backgroundColor = percent > 50 ? '#2ecc71' : percent > 25 ? '#f39c12' : '#e74c3c';

    el.querySelector('.token-statuses').innerHTML = 
        Array.from(tok.statuses).map(s => `<span class="status-badge">${s}</span>`).join('');
};

R20.setupTokenEvents = function(tok) {
    const el = tok.el;
    let isDragging = false;
    let startDragX = 0, startDragY = 0;
    let origX = 0, origY = 0;

    const hpBubble = el.querySelector('.bubble-hp');
    const hpPopover = el.querySelector('.hp-popover');
    const hpInput = hpPopover.querySelector('input');

    hpBubble.addEventListener('click', (e) => {
        e.stopPropagation();
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

    el.addEventListener('pointerdown', (e) => {
        if (R20.isEditMode) return;
        if (e.target.closest('.bubble') || e.target.closest('.hp-popover')) return;

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
        R20.updateVision();
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
        R20.updateVision();
		R20.broadcast({ type: 'TOKEN_MOVE', id: tok.id, x: tok.x, y: tok.y });
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
    R20.updateVision();

    const tok = R20.tokens.find(t => t.id === id);
    if (tok) {
        document.getElementById('token-list-view').style.display = 'none';
        document.getElementById('token-editor-body').style.display = 'block';
        R20.fillTokenEditor(tok);
    } else {
        document.getElementById('token-editor-body').style.display = 'none';
        document.getElementById('token-list-view').style.display = 'block';
        R20.renderTokenListView();
    }
    R20.renderInitiative();
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
    document.getElementById('token-title').innerHTML = `Selezionato: <b>${tok.name}</b>`;
    document.getElementById('edit-name').value = tok.name;
    document.getElementById('edit-symbol').value = tok.symbol;
    document.getElementById('edit-color').value = tok.color;
    document.getElementById('edit-size').value = tok.size || 1;

    document.getElementById('edit-hp').value = tok.hp;
    document.getElementById('edit-maxhp').value = tok.maxHp;
    document.getElementById('edit-ac').value = tok.ac;
    document.getElementById('edit-init-mod').value = tok.initBonus || '1d20+2';

    document.getElementById('edit-vision-range').value = tok.visionRadius;
    document.getElementById('edit-darkvision').value = tok.hasDarkvision ? 'yes' : 'no';
    document.getElementById('edit-darkvision-range').value = tok.darkvisionRange;

    R20.renderTokenAttacksList(tok);

    const buttons = document.getElementById('status-picker').children;
    for (let i = 0; i < buttons.length; i++) {
        const icon = buttons[i].innerText;
        buttons[i].classList.toggle('active', tok.statuses.has(icon));
    }
};

R20.updateCurrentTokenProps = function() {
    const tok = R20.tokens.find(t => t.id === R20.selectedTokenId);
    if (!tok) return;

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
    R20.renderInitiative();
    R20.updateVision();
	R20.broadcast({ type: 'TOKEN_UPDATE_ALL', token: R20.getGameState().tokens.find(t => t.id === tok.id) });
};

R20.handleTokenImageUpload = function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        const tok = R20.tokens.find(t => t.id === R20.selectedTokenId);
        if (tok) {
            tok.imgUrl = evt.target.result;
            R20.updateTokenVisuals(tok);
            R20.renderTokenListView();
            R20.addChatMessage("Avatar", `Immagine caricata per <b>${tok.name}</b>.`);
        }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
	R20.broadcast({ type: 'TOKEN_UPDATE_ALL', token: R20.getGameState().tokens.find(t => t.id === tok.id) });
};

R20.removeTokenImage = function() {
    const tok = R20.tokens.find(t => t.id === R20.selectedTokenId);
    if (tok) {
        tok.imgUrl = '';
        R20.updateTokenVisuals(tok);
        R20.renderTokenListView();
    }
};

R20.applyHpMath = function(tok, str) {
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
    R20.addChatMessage("Salute", `<b>${tok.name}</b> HP: <b>${tok.hp}/${tok.maxHp}</b> (${str})`);
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
                <input type="text" placeholder="1d20+4" value="${atk.hitFormula || ''}" title="Tiro per Colpire / TxC (es. 1d20+4)"
                       style="text-align:center;" oninput="R20.updateAttackField(${tok.id}, ${atk.id}, 'hitFormula', this.value)">
                <input type="text" placeholder="1d8+3" value="${atk.damageFormula || ''}" title="Tiro Danni (es. 1d8+3)"
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
	R20.broadcast({ type: 'TOKEN_HP', id: tok.id, hp: tok.hp });
};

R20.addNewAttackToCurrentToken = function() {
    const tok = R20.tokens.find(t => t.id === R20.selectedTokenId);
    if (!tok) return;

    if (!tok.attacks) tok.attacks = [];
    tok.attacks.push({
        id: Date.now(),
        name: `Attacco ${tok.attacks.length + 1}`,
        hitFormula: '1d20+4',
        damageFormula: '1d6+2',
        count: 0
    });

    R20.renderTokenAttacksList(tok);
};

R20.removeAttackFromToken = function(tokId, atkId) {
    const tok = R20.tokens.find(t => t.id === tokId);
    if (!tok) return;

    tok.attacks = tok.attacks.filter(a => a.id !== atkId);
    R20.renderTokenAttacksList(tok);
};

R20.updateAttackField = function(tokId, atkId, field, value) {
    const tok = R20.tokens.find(t => t.id === tokId);
    if (!tok) return;

    const atk = tok.attacks.find(a => a.id === atkId);
    if (!atk) return;

    atk[field] = value;
};

R20.toggleStatus = function(icon) {
    const tok = R20.tokens.find(t => t.id === R20.selectedTokenId);
    if (!tok) return;

    if (tok.statuses.has(icon)) tok.statuses.delete(icon);
    else tok.statuses.add(icon);

    R20.updateTokenVisuals(tok);
    R20.fillTokenEditor(tok);
	R20.broadcast({ type: 'TOKEN_UPDATE_ALL', token: R20.getGameState().tokens.find(t => t.id === tok.id) });
};

R20.deleteCurrentToken = function() {
    if (!R20.selectedTokenId) return;
    const idx = R20.tokens.findIndex(t => t.id === R20.selectedTokenId);
    if (idx !== -1) {
        R20.tokens[idx].el.remove();
        R20.tokens.splice(idx, 1);
    }
    R20.removeFromInit(R20.selectedTokenId);
    R20.selectToken(null);
	R20.broadcast({ type: 'TOKEN_DELETE', id: selectedTokenId });
};

R20.spawnToken = function() {
    const id = Date.now();
    const colors = ['#e67e22', '#16a085', '#2980b9', '#8e44ad', '#d35400'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const tok = R20.makeToken(id, `Personaggio ${R20.tokens.length + 1}`, 'P', 25, 25, 14, color, 200, 350, [
        { id: Date.now(), name: 'Spada Corta', hitFormula: '1d20+4', damageFormula: '1d6+2', count: 0 }
    ], '1d20+2', 350, false, 0, 1, '');
    R20.tokens.push(tok);
    R20.initTokens();
    R20.selectToken(id);
	R20.broadcast({ type: 'TOKEN_SPAWN', token: R20.getGameState().tokens.find(t => t.id === id) });
};