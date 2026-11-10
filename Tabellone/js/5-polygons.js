window.R20 = window.R20 || {};

R20.isEditMode = false;
R20.selectedPolygonId = null;
R20.currentDrawPoints = [];
R20.polygons = [];

R20.toggleEditMode = function() {
    R20.isEditMode = !R20.isEditMode;

    const banner = document.getElementById('edit-banner');
    if (banner) banner.style.display = R20.isEditMode ? 'block' : 'none';

    const statusBadge = document.getElementById('edit-status-badge');
    if (statusBadge) {
        statusBadge.innerText = R20.isEditMode ? 'ATTIVA (Tutto visibile)' : 'Spenta';
        statusBadge.style.color = R20.isEditMode ? '#e67e22' : '#888';
    }

    const btn = document.getElementById('btn-toggle-edit');
    if (btn) {
        btn.innerText = R20.isEditMode ? '✔ Esci dalla Modalità Edit' : '🛠️ Attiva Modalità Edit (Vedi Tutto)';
        btn.className = R20.isEditMode ? 'btn btn-block btn-success' : 'btn btn-block btn-warning';
    }

    if (!R20.isEditMode) {
        R20.cancelCurrentPolygon();
        R20.deselectPolygon();
    }

    R20.updateVision();
    R20.renderPolygons();
};

R20.selectPolygon = function(id) {
    R20.selectedPolygonId = id;
    R20.renderPolygons();
    R20.updatePolygonsSidebar();

    const p = R20.polygons.find(item => item.id === id);
    if (!p) {
        document.getElementById('box-edit-poly').style.display = 'none';
        return;
    }

    document.getElementById('box-edit-poly').style.display = 'block';
    document.getElementById('selected-poly-name').value = p.name;
    document.getElementById('selected-poly-color').value = p.color || '#2c3e50';
    document.getElementById('selected-poly-texture').value = p.texture || 'none';
    document.getElementById('selected-poly-layer').value = p.layer;
    document.getElementById('selected-poly-vision').value = p.blocksVision ? 'opaque' : 'transparent';
    document.getElementById('selected-poly-passable').value = p.passable ? 'yes' : 'no';
    document.getElementById('selected-poly-emits-light').value = p.emitsLight ? 'yes' : 'no';
    document.getElementById('selected-poly-light-radius').value = p.lightRadius || 250;
    document.getElementById('selected-poly-light-color').value = p.lightColor || '#f39c12';

    document.getElementById('row-custom-texture').style.display = (p.texture === 'custom') ? 'flex' : 'none';
    R20.switchTab('edit-tab');
};

R20.deselectPolygon = function() {
    R20.selectedPolygonId = null;
    const box = document.getElementById('box-edit-poly');
    if (box) box.style.display = 'none';
    R20.renderPolygons();
    R20.updatePolygonsSidebar();
};

R20.updateSelectedPolygonProps = function() {
    const p = R20.polygons.find(item => item.id === R20.selectedPolygonId);
    if (!p) return;

    p.name = document.getElementById('selected-poly-name').value || 'Poligono';
    p.color = document.getElementById('selected-poly-color').value;
    p.texture = document.getElementById('selected-poly-texture').value;
    p.layer = document.getElementById('selected-poly-layer').value;
    p.blocksVision = document.getElementById('selected-poly-vision').value === 'opaque';
    p.passable = document.getElementById('selected-poly-passable').value === 'yes';
    p.emitsLight = document.getElementById('selected-poly-emits-light').value === 'yes';
    p.lightRadius = Math.max(0, parseInt(document.getElementById('selected-poly-light-radius').value) || 0);
    p.lightColor = document.getElementById('selected-poly-light-color').value || '#f39c12';

    document.getElementById('row-custom-texture').style.display = (p.texture === 'custom') ? 'flex' : 'none';

    R20.renderPolygons();
    R20.updatePolygonsSidebar();
    R20.updateVision();
};

R20.handlePolygonTextureUpload = function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        const p = R20.polygons.find(item => item.id === R20.selectedPolygonId);
        if (p) {
            p.customTextureUrl = evt.target.result;
            R20.renderPolygons();
            R20.updatePolygonsSidebar();
            R20.addChatMessage("Texture", `Texture applicata a <b>${p.name}</b>.`);
        }
    };
    reader.readAsDataURL(file);
};

R20.deleteSelectedPolygon = function() {
    if (!R20.selectedPolygonId) return;
    R20.polygons = R20.polygons.filter(p => p.id !== R20.selectedPolygonId);
    R20.deselectPolygon();
    R20.updateVision();
	R20.broadcast({ type: 'POLY_SYNC', polygons: R20.polygons });
};

R20.completeCurrentPolygon = function() {
    if (R20.currentDrawPoints.length < 3) {
        alert("Un poligono richiede almeno 3 punti!");
        return;
    }

    const layer = document.getElementById('new-poly-layer').value;
    const color = document.getElementById('new-poly-color').value;
    const texture = document.getElementById('new-poly-texture').value;
    const emitsLight = document.getElementById('new-poly-light').checked;
    const newId = Date.now();

    R20.polygons.push({
        id: newId,
        name: `${layer} ${R20.polygons.length + 1}`,
        layer,
        blocksVision: layer !== 'Base',
        passable: layer === 'Base',
        color: color || '#2c3e50',
        texture: texture || 'none',
        customTextureUrl: '',
        emitsLight: emitsLight,
        lightRadius: emitsLight ? 250 : 0,
        lightColor: '#f39c12',
        points: [...R20.currentDrawPoints]
		
    });

    R20.currentDrawPoints = [];
    document.getElementById('new-poly-light').checked = false;
    R20.selectPolygon(newId);
    R20.updateVision();
	R20.broadcast({ type: 'POLY_SYNC', polygons: R20.polygons });
};

R20.cancelCurrentPolygon = function() {
    R20.currentDrawPoints = [];
    R20.renderPolygons();
};

R20.generateSvgPattern = function(p) {
    const pid = `pat-poly-${p.id}`;
    const baseColor = p.color || '#2c3e50';

    if (p.texture === 'mattoni') {
        return `<pattern id="${pid}" width="40" height="24" patternUnits="userSpaceOnUse">
            <rect width="40" height="24" fill="${baseColor}" />
            <path d="M 0 12 L 40 12 M 0 24 L 40 24 M 20 0 L 20 12 M 0 12 L 0 24 M 40 12 L 40 24" stroke="rgba(0,0,0,0.45)" stroke-width="2" fill="none" />
        </pattern>`;
    } else if (p.texture === 'pietra') {
        return `<pattern id="${pid}" width="50" height="50" patternUnits="userSpaceOnUse">
            <rect width="50" height="50" fill="${baseColor}" />
            <path d="M 0 25 Q 12 20 25 25 T 50 25 M 25 0 Q 30 12 25 25 T 25 50" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="2" />
        </pattern>`;
    } else if (p.texture === 'legno') {
        return `<pattern id="${pid}" width="60" height="30" patternUnits="userSpaceOnUse">
            <rect width="60" height="30" fill="${baseColor}" />
            <line x1="0" y1="15" x2="60" y2="15" stroke="rgba(0,0,0,0.5)" stroke-width="2" />
            <line x1="0" y1="30" x2="60" y2="30" stroke="rgba(0,0,0,0.5)" stroke-width="2" />
        </pattern>`;
    } else if (p.texture === 'erba') {
        return `<pattern id="${pid}" width="40" height="40" patternUnits="userSpaceOnUse">
            <rect width="40" height="40" fill="${baseColor}" />
            <path d="M 8 20 L 10 10 M 28 36 L 30 26" stroke="rgba(0,0,0,0.35)" stroke-width="2" stroke-linecap="round" fill="none" />
        </pattern>`;
    } else if (p.texture === 'acqua') {
        return `<pattern id="${pid}" width="50" height="25" patternUnits="userSpaceOnUse">
            <rect width="50" height="25" fill="${baseColor}" />
            <path d="M 0 8 Q 12 4 25 8 T 50 8 M 0 20 Q 12 16 25 20 T 50 20" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2" />
        </pattern>`;
    } else if (p.texture === 'custom' && p.customTextureUrl) {
        return `<pattern id="${pid}" width="100" height="100" patternUnits="userSpaceOnUse">
            <image href="${p.customTextureUrl}" width="100" height="100" preserveAspectRatio="none" />
        </pattern>`;
    }
    return '';
};

R20.renderPolygons = function() {
    const mapSvg = document.getElementById('map-svg');
    const lightIconsContainer = document.getElementById('light-icons-container');
    if (!mapSvg || !lightIconsContainer) return;

    let svgHtml = '';
    let defsHtml = '<defs>';
    let iconsHtml = '';

    R20.polygons.forEach(p => {
        if (p.texture && p.texture !== 'none') {
            defsHtml += R20.generateSvgPattern(p);
        }
    });
    defsHtml += '</defs>';
    svgHtml += defsHtml;

    R20.polygons.forEach(p => {
        const pts = p.points.map(pt => `${pt[0]},${pt[1]}`).join(' ');
        let cls = 'poly-shape';

        if (p.id === R20.selectedPolygonId) cls += ' poly-selected';

        let fillStyle = p.color || '#2c3e50';
        if (p.texture && p.texture !== 'none') {
            fillStyle = `url(#pat-poly-${p.id})`;
        }

        let fillOpacity = p.layer === 'Base' ? '0.75' : '1';
        const pointerStyle = R20.isEditMode ? 'cursor: pointer; pointer-events: all;' : 'pointer-events: none;';
        svgHtml += `<polygon points="${pts}" class="${cls}" fill="${fillStyle}" fill-opacity="${fillOpacity}" stroke="#111" stroke-width="2" style="${pointerStyle}" onclick="R20.handlePolygonClick(event, ${p.id})" />`;

        if (p.emitsLight && p.lightRadius > 0) {
            const [cx, cy] = R20.getPolygonCentroid(p.points);
            iconsHtml += `<div class="light-source-icon" style="left:${cx}px; top:${cy}px;">🔥</div>`;
        }
    });

    if (R20.currentDrawPoints.length > 0) {
        const pts = R20.currentDrawPoints.map(pt => `${pt[0]},${pt[1]}`).join(' ');
        svgHtml += `<polyline points="${pts}" class="poly-preview" style="pointer-events:none;" />`;
        R20.currentDrawPoints.forEach(pt => {
            svgHtml += `<circle cx="${pt[0]}" cy="${pt[1]}" r="4" fill="#f1c40f" style="pointer-events:none;" />`;
        });
    }

    mapSvg.innerHTML = svgHtml;
    lightIconsContainer.innerHTML = iconsHtml;
};

R20.handlePolygonClick = function(e, id) {
    if (!R20.isEditMode) return;
    e.stopPropagation();
    R20.selectPolygon(id);
};

R20.updatePolygonsSidebar = function() {
    const container = document.getElementById('polygons-list');
    if (!container) return;
    container.innerHTML = R20.polygons.map(p => `
        <div class="poly-item-row ${p.id === R20.selectedPolygonId ? 'selected' : ''}" onclick="R20.selectPolygon(${p.id})">
            <div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:${p.color || '#333'}; border:1px solid #777;"></span>
                    <b>${p.name}</b> <span style="color:#aaa;">(${p.layer})</span>
                </div>
                <span style="color:#888; font-size:10px;">
                    ${p.texture && p.texture !== 'none' ? `Texture: <b>${p.texture}</b> | ` : ''}
                    ${p.passable ? '🟢 Passabile' : '🔴 Bloccante'} | ${p.blocksVision ? '🕶️ Opaco' : '👁️ Trasp.'}
                    ${p.emitsLight ? ` | <span style="color:#f39c12;">🔥 Luce: ${p.lightRadius}px</span>` : ''}
                </span>
            </div>
            <button class="btn btn-danger" style="padding:2px 6px; font-size:11px;" onclick="event.stopPropagation(); R20.deletePolygonById(${p.id})">✖</button>
        </div>
    `).join('');
	R20.broadcast({ type: 'POLY_SYNC', polygons: R20.polygons });
};

R20.deletePolygonById = function(id) {
    R20.polygons = R20.polygons.filter(p => p.id !== id);
    if (R20.selectedPolygonId === id) R20.deselectPolygon();
    else {
        R20.renderPolygons();
        R20.updatePolygonsSidebar();
        R20.updateVision();
    }
};