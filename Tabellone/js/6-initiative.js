window.R20 = window.R20 || {};

R20.initiativeList = [];
R20.currentTurnIndex = 0;
R20.currentRound = 1;
R20.draggedInitIndex = null;

R20.rollCurrentTokenInitiative = function() {
    const tok = R20.tokens.find(t => t.id === R20.selectedTokenId);
    if (!tok) return;

    let formula = (tok.initBonus || '1d20+2').trim();
    if (!formula.toLowerCase().includes('d')) {
        formula = formula.startsWith('+') || formula.startsWith('-') ? `1d20${formula}` : `1d20+${formula}`;
    }

    const res = R20.evaluateDiceFormula(formula);
    const existing = R20.initiativeList.find(i => i.tokenId === tok.id);
    if (existing) {
        existing.value = res.total;
    } else {
        R20.initiativeList.push({ tokenId: tok.id, value: res.total });
    }

    R20.sortInitiative();
    R20.renderInitiative();
    R20.addChatMessage("Iniziativa", `🎲 <b>${tok.name}</b> tira iniziativa (${formula}): ${res.breakdown} = <b>${res.total}</b>`, res.total);
    
    // Invia solo su azione del giocatore
    if (R20.broadcast) {
        R20.broadcast({
            type: 'INIT_SYNC',
            list: R20.initiativeList,
            currentTurnIndex: R20.currentTurnIndex,
            currentRound: R20.currentRound
        });
        R20.broadcast({
            type: 'CHAT_MSG',
            title: "Iniziativa",
            detail: `🎲 <b>${tok.name}</b> tira iniziativa (${formula}): ${res.breakdown} = <b>${res.total}</b>`,
            total: res.total
        });
    }
    R20.switchTab('init-tab');
};

R20.addSelectedToInit = function() {
    const tok = R20.tokens.find(t => t.id === R20.selectedTokenId);
    if (!tok) return;
    if (R20.initiativeList.find(i => i.tokenId === tok.id)) return;

    let formula = (tok.initBonus || '1d20+2').trim();
    if (!formula.toLowerCase().includes('d')) {
        formula = formula.startsWith('+') || formula.startsWith('-') ? `1d20${formula}` : `1d20+${formula}`;
    }
    const res = R20.evaluateDiceFormula(formula);

    R20.initiativeList.push({ tokenId: tok.id, value: res.total });
    R20.sortInitiative();
    R20.renderInitiative();
    R20.addChatMessage("Iniziativa", `<b>${tok.name}</b> entra in iniziativa con <b>${res.total}</b>`);

    if (R20.broadcast) {
        R20.broadcast({
            type: 'INIT_SYNC',
            list: R20.initiativeList,
            currentTurnIndex: R20.currentTurnIndex,
            currentRound: R20.currentRound
        });
    }
};

R20.rollAllInitiative = function() {
    R20.initiativeList = R20.tokens.map(tok => {
        let formula = (tok.initBonus || '1d20+2').trim();
        if (!formula.toLowerCase().includes('d')) {
            formula = formula.startsWith('+') || formula.startsWith('-') ? `1d20${formula}` : `1d20+${formula}`;
        }
        const res = R20.evaluateDiceFormula(formula);
        return { tokenId: tok.id, value: res.total };
    });
    R20.sortInitiative();
    R20.currentTurnIndex = 0;
    R20.currentRound = 1;
    R20.renderInitiative();
    R20.addChatMessage("Iniziativa", "Tiro iniziativa completato per tutti!");

    if (R20.broadcast) {
        R20.broadcast({
            type: 'INIT_SYNC',
            list: R20.initiativeList,
            currentTurnIndex: R20.currentTurnIndex,
            currentRound: R20.currentRound
        });
        R20.broadcast({
            type: 'CHAT_MSG',
            title: "Iniziativa",
            detail: "Tiro iniziativa completato per tutti!"
        });
    }
};

R20.sortInitiative = function() {
    R20.initiativeList.sort((a, b) => b.value - a.value);
};

R20.nextTurn = function() {
    if (R20.initiativeList.length === 0) return;
    R20.currentTurnIndex++;
    if (R20.currentTurnIndex >= R20.initiativeList.length) {
        R20.currentTurnIndex = 0;
        R20.currentRound++;
    }
    R20.renderInitiative();

    const current = R20.initiativeList[R20.currentTurnIndex];
    if (current) R20.selectToken(current.tokenId);

    if (R20.broadcast) {
        R20.broadcast({
            type: 'INIT_SYNC',
            list: R20.initiativeList,
            currentTurnIndex: R20.currentTurnIndex,
            currentRound: R20.currentRound
        });
    }
};

R20.clearInitiative = function() {
    R20.initiativeList = [];
    R20.currentTurnIndex = 0;
    R20.currentRound = 1;
    R20.renderInitiative();

    if (R20.broadcast) {
        R20.broadcast({
            type: 'INIT_SYNC',
            list: R20.initiativeList,
            currentTurnIndex: R20.currentTurnIndex,
            currentRound: R20.currentRound
        });
    }
};

R20.removeFromInit = function(tokenId) {
    R20.initiativeList = R20.initiativeList.filter(i => i.tokenId !== tokenId);
    R20.renderInitiative();

    if (R20.broadcast) {
        R20.broadcast({
            type: 'INIT_SYNC',
            list: R20.initiativeList,
            currentTurnIndex: R20.currentTurnIndex,
            currentRound: R20.currentRound
        });
    }
};

// Funzione grafica pura: ZERO broadcast all'interno!
R20.renderInitiative = function() {
    const roundEl = document.getElementById('lbl-round');
    if (roundEl) roundEl.innerText = R20.currentRound;
    const container = document.getElementById('initiative-list');
    if (!container) return;

    container.innerHTML = R20.initiativeList.map((item, idx) => {
        const tok = R20.tokens.find(t => t.id === item.tokenId);
        if (!tok) return '';
        const isActive = idx === R20.currentTurnIndex;
        const isSelected = tok.id === R20.selectedTokenId;

        return `
            <div class="init-row ${isActive ? 'active-turn' : ''} ${isSelected ? 'selected-token-row' : ''}"
                 draggable="true"
                 data-idx="${idx}"
                 onclick="R20.handleInitRowClick(event, ${tok.id})"
                 ondragstart="R20.handleInitDragStart(event, ${idx})"
                 ondragover="R20.handleInitDragOver(event)"
                 ondragenter="R20.handleInitDragEnter(event)"
                 ondragleave="R20.handleInitDragLeave(event)"
                 ondrop="R20.handleInitDrop(event, ${idx})"
                 ondragend="R20.handleInitDragEnd(event)">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="drag-handle" title="Trascina per riordinare">☰</span>
                    <span style="display:inline-block; width:22px; height:22px; border-radius:50%; background:${tok.color}; text-align:center; font-size:11px; font-weight:bold; line-height:22px; color:white; overflow:hidden;">
                        ${tok.imgUrl ? `<img src="${tok.imgUrl}" style="width:100%;height:100%;object-fit:cover;">` : tok.symbol}
                    </span>
                    <span style="font-weight:${isActive ? 'bold' : 'normal'}">${tok.name}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="number" value="${item.value}" 
                           onclick="event.stopPropagation()"
                           onchange="event.stopPropagation(); item.value = parseInt(this.value); R20.renderInitiative(); if(R20.broadcast) R20.broadcast({type:'INIT_SYNC', list:R20.initiativeList, currentTurnIndex:R20.currentTurnIndex, currentRound:R20.currentRound});" />
                    <button class="btn btn-danger" style="padding:2px 6px; font-size:11px;" 
                            onclick="event.stopPropagation(); R20.removeFromInit(${tok.id})">✖</button>
                </div>
            </div>
        `;
    }).join('');
};

R20.handleInitRowClick = function(e, tokenId) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    R20.selectToken(tokenId);
};

R20.handleInitDragStart = function(e, index) {
    R20.draggedInitIndex = index;
    e.dataTransfer.effectAllowed = 'move';
    e.target.classList.add('init-dragging');
};

R20.handleInitDragOver = function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
};

R20.handleInitDragEnter = function(e) {
    const row = e.target.closest('.init-row');
    if (row) row.classList.add('init-drag-over');
};

R20.handleInitDragLeave = function(e) {
    const row = e.target.closest('.init-row');
    if (row) row.classList.remove('init-drag-over');
};

R20.handleInitDrop = function(e, targetIndex) {
    e.preventDefault();
    const row = e.target.closest('.init-row');
    if (row) row.classList.remove('init-drag-over');

    if (R20.draggedInitIndex !== null && R20.draggedInitIndex !== targetIndex) {
        const currentActiveTokId = R20.initiativeList[R20.currentTurnIndex]?.tokenId;
        const movedItem = R20.initiativeList.splice(R20.draggedInitIndex, 1)[0];
        R20.initiativeList.splice(targetIndex, 0, movedItem);

        if (currentActiveTokId) {
            currentTurnIndex = R20.initiativeList.findIndex(i => i.tokenId === currentActiveTokId);
            if (currentTurnIndex === -1) currentTurnIndex = 0;
        }

        R20.renderInitiative();

        if (R20.broadcast) {
            R20.broadcast({
                type: 'INIT_SYNC',
                list: R20.initiativeList,
                currentTurnIndex: R20.currentTurnIndex,
                currentRound: R20.currentRound
            });
        }
    }
};

R20.handleInitDragEnd = function() {
    R20.draggedInitIndex = null;
    document.querySelectorAll('.init-row').forEach(r => {
        r.classList.remove('init-dragging', 'init-drag-over');
    });
};
