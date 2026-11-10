window.R20 = window.R20 || {};

R20.sceneLighting = 'dark';
R20.isVisionAccordionOpen = false;

R20.toggleVisionAccordion = function() {
    R20.isVisionAccordionOpen = !R20.isVisionAccordionOpen;
    const body = document.getElementById('vision-accordion-body');
    const arrow = document.getElementById('vision-accordion-arrow');
    if (body && arrow) {
        body.style.display = R20.isVisionAccordionOpen ? 'block' : 'none';
        arrow.innerText = R20.isVisionAccordionOpen ? '▲' : '▼';
    }
};

R20.toggleSceneLight = function() {
    R20.sceneLighting = R20.sceneLighting === 'bright' ? 'dark' : 'bright';
    const btn = document.getElementById('btn-scene-light');
    if (btn) {
        btn.innerText = R20.sceneLighting === 'bright' ? '☀️ Giorno' : '🌙 Buio';
        btn.className = R20.sceneLighting === 'bright' ? 'btn btn-warning' : 'btn';
    }
    R20.updateVision();
	R20.broadcast({ type: 'SCENE_LIGHT', lighting: R20.sceneLighting });
};

R20.updateVision = function() {
    const fogCanvas = document.getElementById('fog-canvas');
    if (!fogCanvas) return;
    const ctxFog = fogCanvas.getContext('2d');
    ctxFog.clearRect(0, 0, fogCanvas.width, fogCanvas.height);

    if (R20.isEditMode) {
        R20.tokens.forEach(t => {
            if (t.el) { t.el.style.opacity = '1'; t.el.style.pointerEvents = 'all'; }
        });
        return;
    }

    const selected = R20.tokens.find(t => t.id === R20.selectedTokenId);
    const revealedPolygons = [];

    if (R20.sceneLighting === 'bright') {
        if (!selected) {
            R20.tokens.forEach(t => { if (t.el) { t.el.style.opacity = '1'; t.el.style.pointerEvents = 'all'; } });
            return;
        }

        ctxFog.fillStyle = 'rgba(10, 12, 18, 0.94)';
        ctxFog.fillRect(0, 0, fogCanvas.width, fogCanvas.height);

        const cx = selected.x + (selected.size * R20.GRID_SIZE) / 2;
        const cy = selected.y + (selected.size * R20.GRID_SIZE) / 2;
        const r = selected.visionRadius;
        const { points: visPoly, hitPolygons } = R20.computeVisibilityPolygon(cx, cy, r);

        R20.carveVisibilityPolygon(visPoly, cx, cy, r, 'rgba(0,0,0,1)', 'rgba(0,0,0,0)', hitPolygons);
        revealedPolygons.push(visPoly);
        R20.drawVisionBoundary(cx, cy, r, 'rgba(0, 195, 255, 0.4)');
    } else {
        ctxFog.fillStyle = 'rgba(8, 10, 15, 0.97)';
        ctxFog.fillRect(0, 0, fogCanvas.width, fogCanvas.height);

        // Sorgenti di Luce dei Poligoni
        R20.polygons.forEach(p => {
            if (p.emitsLight && p.lightRadius > 0) {
                const [lx, ly] = R20.getPolygonCentroid(p.points);
                const { points: lightPoly, hitPolygons } = R20.computeVisibilityPolygon(lx, ly, p.lightRadius);
                R20.carveVisibilityPolygon(lightPoly, lx, ly, p.lightRadius, 'rgba(0,0,0,1)', 'rgba(0,0,0,0)', hitPolygons);
                revealedPolygons.push(lightPoly);
                R20.drawLightGlow(lx, ly, p.lightRadius, p.lightColor || '#f39c12');
            }
        });

        if (selected) {
            const cx = selected.x + (selected.size * R20.GRID_SIZE) / 2;
            const cy = selected.y + (selected.size * R20.GRID_SIZE) / 2;

            if (selected.hasDarkvision && selected.darkvisionRange > 0) {
                const dRadius = selected.darkvisionRange;
                const { points: darkPoly, hitPolygons } = R20.computeVisibilityPolygon(cx, cy, dRadius);
                R20.carveVisibilityPolygon(darkPoly, cx, cy, dRadius, 'rgba(0,0,0,1)', 'rgba(0,0,0,0)', hitPolygons);
                revealedPolygons.push(darkPoly);
                R20.drawVisionBoundary(cx, cy, dRadius, 'rgba(0, 255, 200, 0.45)');
            } else {
                const { points: touchPoly, hitPolygons } = R20.computeVisibilityPolygon(cx, cy, 35);
                R20.carveVisibilityPolygon(touchPoly, cx, cy, 35, 'rgba(0,0,0,1)', 'rgba(0,0,0,0)', hitPolygons);
                revealedPolygons.push(touchPoly);
            }
        }
    }

    // Occulta o svela pedine nemiche
    R20.tokens.forEach(t => {
        if (!t.el) return;
        if (selected && t.id === selected.id) {
            t.el.style.opacity = '1';
            t.el.style.pointerEvents = 'all';
            return;
        }

        const tcx = t.x + (t.size * R20.GRID_SIZE) / 2;
        const tcy = t.y + (t.size * R20.GRID_SIZE) / 2;

        let isSeen = false;
        for (let i = 0; i < revealedPolygons.length; i++) {
            const pts = revealedPolygons[i].map(pt => [pt.x, pt.y]);
            if (R20.isPointInsidePolygon([tcx, tcy], pts)) {
                isSeen = true;
                break;
            }
        }

        t.el.style.opacity = isSeen ? '1' : '0';
        t.el.style.pointerEvents = isSeen ? 'all' : 'none';
    });
};

R20.carveVisibilityPolygon = function(poly, cx, cy, r, innerColor, outerColor, hitPolygons = []) {
    const fogCanvas = document.getElementById('fog-canvas');
    if (!fogCanvas || poly.length < 3) return;
    const ctxFog = fogCanvas.getContext('2d');

    ctxFog.save();
    ctxFog.globalCompositeOperation = 'destination-out';

    const grad = ctxFog.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
    grad.addColorStop(0, innerColor);
    grad.addColorStop(0.85, innerColor);
    grad.addColorStop(1, outerColor);

    ctxFog.beginPath();
    ctxFog.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctxFog.lineTo(poly[i].x, poly[i].y);
    ctxFog.closePath();
    ctxFog.fillStyle = grad;
    ctxFog.fill();

    // Svela la superficie dei muri in vista
    if (hitPolygons && hitPolygons.length > 0) {
        ctxFog.save();
        ctxFog.beginPath();
        ctxFog.arc(cx, cy, r, 0, Math.PI * 2);
        ctxFog.clip();

        hitPolygons.forEach(p => {
            ctxFog.beginPath();
            ctxFog.moveTo(p.points[0][0], p.points[0][1]);
            for (let i = 1; i < p.points.length; i++) {
                ctxFog.lineTo(p.points[i][0], p.points[i][1]);
            }
            ctxFog.closePath();
            ctxFog.fillStyle = grad;
            ctxFog.fill();
        });
        ctxFog.restore();
    }

    ctxFog.restore();
};

R20.drawLightGlow = function(cx, cy, r, colorHex) {
    const fogCanvas = document.getElementById('fog-canvas');
    if (!fogCanvas) return;
    const ctxFog = fogCanvas.getContext('2d');

    ctxFog.save();
    ctxFog.globalCompositeOperation = 'source-over';
    const grad = ctxFog.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, R20.hexToRgba(colorHex, 0.25));
    grad.addColorStop(0.7, R20.hexToRgba(colorHex, 0.1));
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctxFog.fillStyle = grad;
    ctxFog.beginPath();
    ctxFog.arc(cx, cy, r, 0, Math.PI * 2);
    ctxFog.fill();
    ctxFog.restore();
};

R20.drawVisionBoundary = function(cx, cy, r, strokeStyle) {
    const fogCanvas = document.getElementById('fog-canvas');
    if (!fogCanvas) return;
    const ctxFog = fogCanvas.getContext('2d');

    ctxFog.save();
    ctxFog.beginPath();
    ctxFog.arc(cx, cy, r, 0, Math.PI * 2);
    ctxFog.strokeStyle = strokeStyle;
    ctxFog.setLineDash([6, 6]);
    ctxFog.lineWidth = 2;
    ctxFog.stroke();
    ctxFog.restore();
};