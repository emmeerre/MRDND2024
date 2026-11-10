window.R20 = window.R20 || {};

R20.rollCustomDice = function() {
    const input = document.getElementById('dice-input');
    const val = input ? input.value.trim() : '';
    if (!val) return;
    const res = R20.evaluateDiceFormula(val);
    const title = `🎲 Tiro Libero: ${val}`;
    const detail = res.breakdown;
    const total = res.total;

    R20.addChatMessage(title, detail, total);

    if (R20.broadcast) {
        R20.broadcast({ type: 'CHAT_MSG', title, detail, total });
    }
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

// Rendering locale puro senza broadcast ricorsivo
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
};
