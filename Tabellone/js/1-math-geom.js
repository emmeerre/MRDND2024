window.R20 = window.R20 || {};

// Costanti Globali
R20.GRID_SIZE = 50;

/**
 * Calcola l'intersezione raggio-segmento
 */
R20.getRayIntersection = function(ox, oy, rdx, rdy, p1, p2) {
    const sdx = p2[0] - p1[0];
    const sdy = p2[1] - p1[1];
    const denominator = rdx * sdy - rdy * sdx;
    if (Math.abs(denominator) < 0.000001) return null;

    const t = ((p1[0] - ox) * sdy - (p1[1] - oy) * sdx) / denominator;
    const u = ((p1[0] - ox) * rdy - (p1[1] - oy) * rdx) / denominator;

    if (t > 0 && u >= 0 && u <= 1) {
        return { x: ox + t * rdx, y: oy + t * rdy, t: t };
    }
    return null;
};

/**
 * Calcola il poligono di visibilità raycasting
 */
R20.computeVisibilityPolygon = function(ox, oy, radius) {
    const segments = [];
    const CIRCLE_DIVS = 36;
    for (let i = 0; i < CIRCLE_DIVS; i++) {
        const a1 = (i / CIRCLE_DIVS) * Math.PI * 2;
        const a2 = ((i + 1) / CIRCLE_DIVS) * Math.PI * 2;
        segments.push([
            [ox + Math.cos(a1) * radius, oy + Math.sin(a1) * radius],
            [ox + Math.cos(a2) * radius, oy + Math.sin(a2) * radius],
            null
        ]);
    }

    R20.polygons.forEach(p => {
        if (p.blocksVision) {
            for (let i = 0; i < p.points.length; i++) {
                const ptA = p.points[i];
                const ptB = p.points[(i + 1) % p.points.length];
                segments.push([ptA, ptB, p]);
            }
        }
    });

    const angles = new Set();
    segments.forEach(seg => {
        [seg[0], seg[1]].forEach(pt => {
            const ang = Math.atan2(pt[1] - oy, pt[0] - ox);
            angles.add(ang);
            angles.add(ang - 0.0001);
            angles.add(ang + 0.0001);
        });
    });

    const hits = [];
    const hitPolygonsSet = new Set();

    angles.forEach(ang => {
        const rdx = Math.cos(ang);
        const rdy = Math.sin(ang);
        let closest = null;
        let closestSeg = null;
        let minT = Infinity;

        for (let i = 0; i < segments.length; i++) {
            const hit = R20.getRayIntersection(ox, oy, rdx, rdy, segments[i][0], segments[i][1]);
            if (hit && hit.t < minT) {
                minT = hit.t;
                closest = hit;
                closestSeg = segments[i];
            }
        }
        if (closest) {
            hits.push({ x: closest.x, y: closest.y, angle: ang });
            if (closestSeg && closestSeg[2] && closest.t <= radius) {
                hitPolygonsSet.add(closestSeg[2]);
            }
        }
    });

    hits.sort((a, b) => a.angle - b.angle);
    return {
        points: hits,
        hitPolygons: Array.from(hitPolygonsSet)
    };
};

/**
 * Algoritmo Point-in-Polygon (Raycasting test)
 */
R20.isPointInsidePolygon = function(point, vs) {
    const x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i][0], yi = vs[i][1];
        const xj = vs[j][0], yj = vs[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

/**
 * Controllo collisione considerando la taglia (size) della pedina
 */
R20.canTokenMoveTo = function(x, y, size = 1) {
    const span = size * R20.GRID_SIZE;
    const testPoints = [
        [x + span / 2, y + span / 2],
        [x + 8, y + 8],
        [x + span - 8, y + 8],
        [x + 8, y + span - 8],
        [x + span - 8, y + span - 8]
    ];
    for (const poly of R20.polygons) {
        if (!poly.passable) {
            for (const pt of testPoints) {
                if (R20.isPointInsidePolygon(pt, poly.points)) return false;
            }
        }
    }
    return true;
};

R20.getPolygonCentroid = function(pts) {
    let sx = 0, sy = 0;
    pts.forEach(p => { sx += p[0]; sy += p[1]; });
    return [sx / pts.length, sy / pts.length];
};

R20.hexToRgba = function(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16) || 243;
    const g = parseInt(hex.slice(3, 5), 16) || 156;
    const b = parseInt(hex.slice(5, 7), 16) || 18;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

R20.getBoardCoords = function(e) {
    const board = document.getElementById('board');
    const rect = board.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) / R20.zoom,
        y: (e.clientY - rect.top) / R20.zoom
    };
};