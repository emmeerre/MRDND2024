window.R20 = window.R20 || {};

R20.rollCustomDice = function() {
    const input = document.getElementById('dice-input');
    const val = input.value.trim();
    if (!val) return;
    const res = R20.evaluateDiceFormula(val);
    R20.addChatMessage(`🎲 Tiro Libero: ${val}`, res.breakdown, res.total);
    R20.switchTab('chat-tab');
};

R20.evaluateDiceFormula = function(formula) {
    const sanitized = formula.toLowerCase().replace(/\s+/g, '');
    const parts = sanitized.split(/(?=[+-])/);

    let total = 0;
    let breakdownParts = [];

    parts.forEach(part => {
        let sign = 1;
        let clean = part;
        if (part.startsWith('+')) clean = part.substring(1);
        else if (part.startsWith('-')) { sign = -1; clean = part.substring(1); }

        if (clean.includes('d')) {
            const [countStr, sidesStr] = clean.split('d');
            const count = countStr === '' ? 1 : parseInt(countStr) || 1;
            const sides = parseInt(sidesStr) || 20;

            let rolls = [];
            for (let i = 0; i < count; i++) {
                const r = Math.floor(Math.random() * sides) + 1;
                rolls.push(r);
                total += r * sign;
            }
            breakdownParts.push((sign === -1 ? '-' : (breakdownParts.length > 0 ? '+' : '')) + `[${rolls.join(',')}]`);
        } else {
            const val = parseInt(clean) || 0;
            total += val * sign;
            breakdownParts.push((sign === -1 ? '-' : (breakdownParts.length > 0 ? '+' : '')) + val);
        }
    });

    return { total, breakdown: breakdownParts.join(' ') };
};

R20.addChatMessage = function(title, detail, total = null) {
    const chatLog = document.getElementById('chat-log');
    if (!chatLog) return;
    const entry = document.createElement('div');
    entry.className = 'chat-entry';
    entry.innerHTML = `
        <div style="font-weight:bold; color:#fff;">${title}</div>
        <div style="color:#bbb; font-size:11px;">${detail}</div>
        ${total !== null ? `<div style="font-weight:bold; color:#00e5ff; font-size:14px; margin-top:2px;">Totale: ${total}</div>` : ''}
    `;
    chatLog.appendChild(entry);
    chatLog.scrollTop = chatLog.scrollHeight;
	R20.broadcast({ type: 'CHAT_MSG', title, detail, total });
};

R20.executeSpecificAttack = function(tokId, atkId) {
    const tok = R20.tokens.find(t => t.id === tokId);
    if (!tok) return;

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

    detail += `<div style="font-size:10px; color:#888; margin-top:2px;">Esecuzioni totali: <b>${atk.count}</b></div>`;
    R20.addChatMessage(`⚔️ ${tok.name} usa ${atk.name || 'Attacco'}`, detail, mainTotal);
    R20.switchTab('chat-tab');
};

R20.resetAttackCounter = function(e, tokId, atkId) {
    e.stopPropagation();
    const tok = R20.tokens.find(t => t.id === tokId);
    if (!tok) return;

    const atk = tok.attacks.find(a => a.id === atkId);
    if (!atk) return;

    atk.count = 0;
    R20.renderTokenAttacksList(tok);
    R20.addChatMessage("Contatore Azzerato", `Il contatore di <b>${atk.name}</b> (${tok.name}) è stato riportato a <b>0</b>.`);
};