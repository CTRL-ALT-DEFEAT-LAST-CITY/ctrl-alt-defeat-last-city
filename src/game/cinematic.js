// =============================================
// LAST CITY · CINEMATIC OPENING
// CTRL + ALT + DEFEAT
// ---------------------------------------------
// The opening sequence: five scenes that show the old world going dark and
// hand the player the job of rebuilding it.
//
// It is a real animation, not a slideshow. Every frame is drawn on a canvas
// from procedural art — skylines, fire, ash, rain, light shafts, silhouetted
// characters — driven by a keyframed camera that pans and pushes in. There are
// no video or image files to download, so the sequence costs nothing to host
// and cannot break with a missing asset.
//
// Rules it respects:
//   * A returning player never sees it again unless they ask (Settings →
//     Replay opening cinematic). The marker lives in the save.
//   * Skip is always one tap away and always ends the sequence immediately.
//   * prefers-reduced-motion collapses it to a short, static, readable
//     storyboard instead of motion.
//   * It hands control back to the game's own start path, so nothing about
//     loading a save or booting the terminal changes.
// =============================================

(function (global) {
    "use strict";

    const EX = () => global.LastCityExpansion;

    function liveGame() { try { return typeof game !== "undefined" ? game : null; } catch (_) { return null; } }
    function exp() { return EX()?.state() || null; }

    const VERSION = (typeof CINEMATIC_VERSION !== "undefined" ? CINEMATIC_VERSION : 1);

    // ---------------------------------------------------------------
    // Runtime state
    // ---------------------------------------------------------------

    const show = {
        root: null, canvas: null, ctx: null,
        width: 0, height: 0, dpr: 1,
        raf: null, running: false,
        startedAt: 0, now: 0, sceneIndex: 0, sceneStart: 0,
        resolve: null,
        skipping: false,
        reduced: false,
        lineIndex: -1,
        lineStart: 0,
        shake: 0,
        flash: 0,
        embers: [],
        ash: [],
        debris: [],
        rng: 1,
        skyline: null,
        lightsOut: 0,
        finished: false
    };

    // A small deterministic generator, so the skyline and particle layout are
    // identical every time the sequence plays. Nothing here should ever look
    // different between two viewings of the same scene.
    function rand() {
        show.rng = (Math.imul(show.rng, 1664525) + 1013904223) >>> 0;
        return show.rng / 4294967296;
    }
    function resetRng(seed) { show.rng = seed >>> 0 || 1; }

    function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
    function clamp01(value) { return Math.min(1, Math.max(0, value)); }
    function lerp(a, b, t) { return a + (b - a) * t; }

    // ---------------------------------------------------------------
    // Characters
    //
    // Drawn, not photographed: a silhouette with a lit rim and a palette, so
    // each speaker is visually distinct without any art assets.
    // ---------------------------------------------------------------

    const CAST = {
        narrator: { name: "", color: "#8193a6", rim: "#8193a6", build: null },
        mara:  { name: "MARA · ENGINEER",  color: "#65baff", rim: "#9fd4ff", build: "tall" },
        tomas: { name: "TOMAS · SCAVENGER", color: "#ffc247", rim: "#ffd98a", build: "broad" },
        vex:   { name: "VEX · SIGNAL OPERATOR", color: "#aa8cff", rim: "#cbb8ff", build: "slim" },
        you:   { name: "YOU", color: "#5bd69b", rim: "#9eecc6", build: "tall" }
    };

    function drawPortrait(ctx, who, x, y, size, time) {
        const person = CAST[who];
        if (!person || !person.build) return;
        const w = size * (person.build === "broad" ? 0.62 : person.build === "slim" ? 0.44 : 0.52);
        const headR = size * 0.17;
        ctx.save();
        ctx.translate(x, y);

        // Backlight
        const glow = ctx.createRadialGradient(0, -size * 0.3, 0, 0, -size * 0.3, size * 0.9);
        glow.addColorStop(0, person.color + "44");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(-size, -size, size * 2, size * 2);

        // Breathing, so a portrait on screen is never completely still.
        const breathe = Math.sin(time * 0.0016) * size * 0.008;

        // A planted shadow, so the figure stands on the ground rather than
        // floating above it.
        ctx.fillStyle = "rgba(0,0,0,.45)";
        ctx.beginPath();
        ctx.ellipse(0, size * 0.52, w * 0.62, size * 0.035, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#0a0f16";
        // Legs
        const legTop = size * 0.1 + breathe;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * w * 0.07, legTop);
            ctx.lineTo(side * w * 0.3, legTop);
            ctx.lineTo(side * w * 0.26, size * 0.5);
            ctx.lineTo(side * w * 0.05, size * 0.5);
            ctx.closePath();
            ctx.fill();
        }
        // Torso: shoulders at the top, tapering to the waist.
        const shoulderY = -size * 0.26 + breathe;
        ctx.beginPath();
        ctx.moveTo(-w * 0.5, shoulderY + size * 0.05);
        ctx.quadraticCurveTo(-w * 0.46, shoulderY - size * 0.03, -w * 0.2, shoulderY - size * 0.05);
        ctx.lineTo(w * 0.2, shoulderY - size * 0.05);
        ctx.quadraticCurveTo(w * 0.46, shoulderY - size * 0.03, w * 0.5, shoulderY + size * 0.05);
        ctx.lineTo(w * 0.33, legTop + size * 0.02);
        ctx.lineTo(-w * 0.33, legTop + size * 0.02);
        ctx.closePath();
        ctx.fill();
        // Head, with a neck gap so the silhouette reads at small sizes.
        ctx.beginPath();
        ctx.arc(0, shoulderY - headR - size * 0.04, headR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-headR * 0.34, shoulderY - headR * 0.9, headR * 0.68, headR * 0.9);

        // Rim light down one side, which is what separates the figure from
        // the night behind it.
        ctx.strokeStyle = person.rim;
        ctx.lineWidth = Math.max(1.2, size * 0.014);
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(0, shoulderY - headR - size * 0.04, headR, Math.PI * 0.08, Math.PI * 1.02);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w * 0.5, shoulderY + size * 0.05);
        ctx.quadraticCurveTo(w * 0.46, shoulderY - size * 0.03, w * 0.2, shoulderY - size * 0.05);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w * 0.5, shoulderY + size * 0.05);
        ctx.lineTo(w * 0.33, legTop + size * 0.02);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // ---------------------------------------------------------------
    // Procedural skyline
    //
    // One generated city, reused across the scenes so the place the player
    // watches fall is recognisably the same place in every shot.
    // ---------------------------------------------------------------

    function buildSkyline() {
        resetRng(20250413);
        const towers = [];
        let x = -0.15;
        while (x < 1.15) {
            const width = 0.025 + rand() * 0.055;
            const height = 0.12 + Math.pow(rand(), 1.5) * 0.52;
            const windows = [];
            const columns = Math.max(1, Math.floor(width * 90));
            const rows = Math.max(2, Math.floor(height * 42));
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < columns; c++) {
                    if (rand() < 0.42) continue;
                    windows.push({ r, c, rows, columns, phase: rand(), out: rand() });
                }
            }
            towers.push({ x, width, height, windows, antenna: rand() < 0.25, depth: 0.5 + rand() * 0.5 });
            x += width + 0.004 + rand() * 0.02;
        }
        show.skyline = towers;
    }

    // `lightsOut` from 0 to 1 extinguishes windows progressively, which is how
    // the collapse scene reads as a grid failure rather than a fade to black.
    // The dialogue plate covers roughly the bottom quarter of the frame, so
    // the horizon sits high enough that nothing important is ever hidden
    // behind it. Every scene measures from this one constant.
    const HORIZON = 0.6;

    function drawSkyline(ctx, camera, lightsOut, time, fireAmount = 0) {
        if (!show.skyline) buildSkyline();
        const horizon = show.height * HORIZON;
        for (const tower of show.skyline) {
            const parallax = 0.4 + tower.depth * 0.6;
            const screenX = (tower.x - 0.5) * show.width * camera.zoom * parallax - camera.x * parallax + show.width / 2;
            const width = tower.width * show.width * camera.zoom * parallax;
            const height = tower.height * show.height * camera.zoom;
            const top = horizon - height - camera.y * parallax * 0.4;
            if (screenX + width < -40 || screenX > show.width + 40) continue;

            const shade = 10 + tower.depth * 16;
            ctx.fillStyle = "rgb(" + shade + "," + (shade + 4) + "," + (shade + 10) + ")";
            ctx.fillRect(screenX, top, width, height + camera.y * parallax * 0.4 + 60);

            // Edge highlight
            ctx.fillStyle = "rgba(120,150,190,.05)";
            ctx.fillRect(screenX, top, Math.max(1, width * 0.08), height);

            // Windows
            for (const window of tower.windows) {
                if (window.out < lightsOut) continue;
                const cellW = width / window.columns;
                const cellH = height / window.rows;
                const wx = screenX + window.c * cellW + cellW * 0.22;
                const wy = top + window.r * cellH + cellH * 0.22;
                const flicker = lightsOut > 0.02 && window.out < lightsOut + 0.08
                    ? (Math.sin(time * 0.05 + window.phase * 40) > 0 ? 1 : 0.15)
                    : 1;
                const warmth = 0.45 + window.phase * 0.5;
                ctx.fillStyle = "rgba(255," + Math.round(190 + warmth * 50) + "," + Math.round(120 + warmth * 60) + "," +
                    (0.5 * flicker).toFixed(2) + ")";
                ctx.fillRect(wx, wy, Math.max(1, cellW * 0.5), Math.max(1, cellH * 0.45));
            }

            if (tower.antenna) {
                ctx.strokeStyle = "rgba(90,110,140,.5)";
                ctx.lineWidth = Math.max(1, width * 0.04);
                ctx.beginPath();
                ctx.moveTo(screenX + width / 2, top);
                ctx.lineTo(screenX + width / 2, top - height * 0.12);
                ctx.stroke();
            }

            // Fires burning in the broken towers
            if (fireAmount > 0 && tower.depth > 0.7 && (tower.x * 100 | 0) % 3 === 0) {
                const fireHeight = height * 0.2 * fireAmount;
                const flicker = 0.6 + Math.sin(time * 0.01 + tower.x * 20) * 0.4;
                const gradient = ctx.createLinearGradient(0, top, 0, top + fireHeight);
                gradient.addColorStop(0, "rgba(255,150,50," + (0.5 * fireAmount * flicker).toFixed(2) + ")");
                gradient.addColorStop(1, "rgba(255,60,20,0)");
                ctx.fillStyle = gradient;
                ctx.fillRect(screenX, top, width, fireHeight);
            }
        }
    }

    // ---------------------------------------------------------------
    // Particles
    // ---------------------------------------------------------------

    function seedParticles() {
        show.embers = [];
        show.ash = [];
        show.debris = [];
        resetRng(777);
        for (let i = 0; i < 90; i++) {
            show.ash.push({ x: rand(), y: rand(), speed: 0.1 + rand() * 0.5, drift: rand() * 2 - 1, size: 0.6 + rand() * 2 });
        }
        for (let i = 0; i < 60; i++) {
            show.embers.push({ x: rand(), y: 0.6 + rand() * 0.5, speed: 0.3 + rand() * 0.9, drift: rand() * 2 - 1, size: 0.8 + rand() * 1.8, phase: rand() * 6.28 });
        }
        for (let i = 0; i < 26; i++) {
            show.debris.push({ x: rand(), y: rand() * 0.5, vx: (rand() - 0.5) * 0.4, vy: 0.2 + rand() * 0.6, spin: rand() * 6.28, size: 2 + rand() * 5 });
        }
    }

    function drawAsh(ctx, amount, time) {
        if (amount <= 0) return;
        ctx.save();
        for (const flake of show.ash) {
            const y = (flake.y + (time * 0.00004 * flake.speed)) % 1;
            const x = (flake.x + Math.sin(time * 0.0004 + flake.drift * 6) * 0.02) % 1;
            ctx.globalAlpha = amount * 0.5;
            ctx.fillStyle = "#d8d2c6";
            ctx.fillRect(x * show.width, y * show.height, flake.size, flake.size);
        }
        ctx.restore();
    }

    function drawEmbers(ctx, amount, time) {
        if (amount <= 0) return;
        ctx.save();
        for (const ember of show.embers) {
            const y = (ember.y - (time * 0.00007 * ember.speed)) % 1.2;
            const yy = y < 0 ? y + 1.2 : y;
            const x = ember.x + Math.sin(time * 0.001 + ember.phase) * 0.012;
            const pulse = 0.5 + Math.sin(time * 0.006 + ember.phase) * 0.5;
            ctx.globalAlpha = amount * (0.35 + pulse * 0.5) * clamp01(yy * 1.4);
            ctx.fillStyle = pulse > 0.5 ? "#ffd27a" : "#ff8b35";
            ctx.fillRect(x * show.width, yy * show.height, ember.size, ember.size);
        }
        ctx.restore();
    }

    function drawRain(ctx, amount, time) {
        if (amount <= 0) return;
        ctx.save();
        ctx.strokeStyle = "rgba(180,205,230,.4)";
        ctx.lineWidth = 1.1;
        for (let i = 0; i < 150; i++) {
            const seed = (i * 97) % 1000 / 1000;
            const x = (seed * show.width + time * 0.12 * (0.5 + seed)) % show.width;
            const y = (((i * 61) % 1000) / 1000 * show.height + time * 0.75 * (0.6 + seed)) % show.height;
            ctx.globalAlpha = amount * 0.55;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 4, y + 16);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ---------------------------------------------------------------
    // Shared scene furniture
    // ---------------------------------------------------------------

    function drawGradientSky(ctx, stops) {
        const gradient = ctx.createLinearGradient(0, 0, 0, show.height);
        for (const [offset, color] of stops) gradient.addColorStop(offset, color);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, show.width, show.height);
    }

    function drawGround(ctx, y, color) {
        ctx.fillStyle = color;
        ctx.fillRect(0, y, show.width, show.height - y);
    }

    function drawLightShaft(ctx, x, y, width, height, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        const gradient = ctx.createLinearGradient(x, y, x, y + height);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(x - width * 0.12, y);
        ctx.lineTo(x + width * 0.12, y);
        ctx.lineTo(x + width, y + height);
        ctx.lineTo(x - width, y + height);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function drawCampfire(ctx, x, y, scale, time) {
        const flicker = 0.75 + Math.sin(time * 0.012) * 0.15 + Math.sin(time * 0.031) * 0.1;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 150 * scale * flicker);
        glow.addColorStop(0, "rgba(255,170,70,.55)");
        glow.addColorStop(0.4, "rgba(255,120,40,.2)");
        glow.addColorStop(1, "rgba(255,90,20,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(x - 160 * scale, y - 160 * scale, 320 * scale, 320 * scale);
        // Logs
        ctx.strokeStyle = "#2a1c13";
        ctx.lineWidth = 5 * scale;
        ctx.beginPath();
        ctx.moveTo(x - 20 * scale, y + 6 * scale);
        ctx.lineTo(x + 18 * scale, y - 2 * scale);
        ctx.moveTo(x - 16 * scale, y - 2 * scale);
        ctx.lineTo(x + 20 * scale, y + 6 * scale);
        ctx.stroke();
        // Flame
        for (let i = 0; i < 3; i++) {
            const h = (26 + i * 7) * scale * flicker;
            ctx.fillStyle = i === 0 ? "rgba(255,230,160,.9)" : i === 1 ? "rgba(255,160,60,.75)" : "rgba(255,90,30,.5)";
            ctx.beginPath();
            ctx.moveTo(x - (7 - i * 2) * scale, y);
            ctx.quadraticCurveTo(x - 2 * scale, y - h * 0.6, x + Math.sin(time * 0.01 + i) * 3 * scale, y - h);
            ctx.quadraticCurveTo(x + 3 * scale, y - h * 0.5, x + (7 - i * 2) * scale, y);
            ctx.closePath();
            ctx.fill();
        }
    }

    // ---------------------------------------------------------------
    // The scenes
    //
    // Each scene owns its duration, a keyframed camera, a draw function, and
    // the dialogue that plays over it. Keeping the dialogue beside the visuals
    // means a timing change never leaves a line orphaned on the wrong shot.
    // ---------------------------------------------------------------

    function cameraAt(keys, progress) {
        if (!keys.length) return { x: 0, y: 0, zoom: 1 };
        if (keys.length === 1) return keys[0];
        for (let i = 0; i < keys.length - 1; i++) {
            const a = keys[i], b = keys[i + 1];
            if (progress >= a.t && progress <= b.t) {
                const local = (progress - a.t) / Math.max(0.0001, b.t - a.t);
                const eased = easeInOut(local);
                return {
                    x: lerp(a.x, b.x, eased),
                    y: lerp(a.y, b.y, eased),
                    zoom: lerp(a.zoom, b.zoom, eased)
                };
            }
        }
        return keys[keys.length - 1];
    }

    const SCENES = [
        // ---- 1. The old world, still lit -----------------------------
        {
            id: "before",
            ms: 11000,
            title: null,
            track: "intro",
            camera: [
                { t: 0,   x: -140, y: 10,  zoom: 1.0 },
                { t: 1,   x: 120,  y: -20, zoom: 1.22 }
            ],
            lines: [
                { at: 600,  who: "narrator", text: "Two hundred years ago, this was the brightest city on the coast." },
                { at: 4600, who: "narrator", text: "Nine million people. Power that never blinked. A grid that fed a continent." },
                { at: 8200, who: "narrator", text: "Nobody wrote down how to live without it." }
            ],
            draw(ctx, camera, elapsed, progress) {
                drawGradientSky(ctx, [
                    [0, "#121b31"], [0.45, "#26354f"], [0.75, "#5a4a52"], [1, "#8a5f44"]
                ]);
                // Low sun over the water
                const sunY = show.height * 0.63 - camera.y * 0.3;
                const sun = ctx.createRadialGradient(show.width * 0.68, sunY, 0, show.width * 0.68, sunY, show.height * 0.5);
                sun.addColorStop(0, "rgba(255,190,120,.55)");
                sun.addColorStop(1, "rgba(255,140,80,0)");
                ctx.fillStyle = sun;
                ctx.fillRect(0, 0, show.width, show.height);
                drawSkyline(ctx, camera, 0, elapsed, 0);
                drawGround(ctx, show.height * HORIZON - camera.y * 0.4, "#0c1119");
                // Street lights along the foreground
                for (let i = 0; i < 9; i++) {
                    const x = (i / 8) * show.width * 1.2 - camera.x * 1.4 - show.width * 0.1;
                    const y = show.height * (HORIZON + 0.02) - camera.y * 0.4;
                    if (x < -60 || x > show.width + 60) continue;
                    ctx.strokeStyle = "#141b26";
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(x, y + 60);
                    ctx.lineTo(x, y - 30);
                    ctx.stroke();
                    const lamp = ctx.createRadialGradient(x, y - 32, 0, x, y - 32, 46);
                    lamp.addColorStop(0, "rgba(255,220,150,.5)");
                    lamp.addColorStop(1, "rgba(255,220,150,0)");
                    ctx.fillStyle = lamp;
                    ctx.fillRect(x - 46, y - 78, 92, 92);
                }
                void progress;
            }
        },

        // ---- 2. The collapse -----------------------------------------
        {
            id: "collapse",
            ms: 12000,
            title: "THE NIGHT THE GRID DIED",
            track: "intro",
            shakeAt: [2600, 5200, 7400, 9600],
            camera: [
                { t: 0,    x: 120,  y: -20, zoom: 1.22 },
                { t: 0.35, x: -40,  y: 40,  zoom: 1.5 },
                { t: 0.7,  x: 180,  y: -60, zoom: 1.1 },
                { t: 1,    x: 0,    y: 0,   zoom: 1.35 }
            ],
            lines: [
                { at: 400,  who: "narrator", text: "It took eleven minutes." },
                { at: 3400, who: "vex",      text: "Substation four is gone. Five is gone. I can't hold the ring —" },
                { at: 6800, who: "mara",     text: "Then we stop trying to hold it. Get everyone to the outpost. NOW." },
                { at: 9800, who: "narrator", text: "The lights went out block by block, and did not come back." }
            ],
            draw(ctx, camera, elapsed, progress) {
                // Lights die across the first two thirds of the scene.
                show.lightsOut = clamp01((progress - 0.08) / 0.62);
                const fire = clamp01((progress - 0.3) / 0.4);
                drawGradientSky(ctx, [
                    [0, "#0a0b14"],
                    [0.5, lerpColor("#26354f", "#2a1118", progress)],
                    [1, lerpColor("#8a5f44", "#5c1f10", progress)]
                ]);
                drawSkyline(ctx, camera, show.lightsOut, elapsed, fire);
                drawGround(ctx, show.height * HORIZON - camera.y * 0.4, "#070a10");
                // Fire glow washing the street, kept to a band just under the
                // skyline so the lower frame stays dark enough to read text on.
                if (fire > 0) {
                    const top = show.height * (HORIZON - 0.12);
                    const glow = ctx.createLinearGradient(0, top, 0, show.height * (HORIZON + 0.14));
                    glow.addColorStop(0, "rgba(255,90,30,0)");
                    glow.addColorStop(0.45, "rgba(255,90,30," + (0.3 * fire).toFixed(2) + ")");
                    glow.addColorStop(1, "rgba(255,90,30,0)");
                    ctx.fillStyle = glow;
                    ctx.fillRect(0, top, show.width, show.height * 0.3);
                }
                drawEmbers(ctx, fire, elapsed);
                // Falling debris
                if (progress > 0.25) {
                    ctx.save();
                    for (const piece of show.debris) {
                        const t = (elapsed * 0.0002 * piece.vy + piece.y) % 1.3;
                        const x = (piece.x + piece.vx * t) * show.width;
                        const y = t * show.height;
                        ctx.globalAlpha = 0.55 * clamp01((progress - 0.25) * 3);
                        ctx.fillStyle = "#1b1410";
                        ctx.save();
                        ctx.translate(x, y);
                        ctx.rotate(piece.spin + t * 6);
                        ctx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.6);
                        ctx.restore();
                    }
                    ctx.restore();
                }
                // Red emergency sweep
                if (progress > 0.2 && progress < 0.85) {
                    const sweep = (Math.sin(elapsed * 0.003) + 1) / 2;
                    ctx.fillStyle = "rgba(255,40,30," + (0.05 + sweep * 0.06).toFixed(3) + ")";
                    ctx.fillRect(0, 0, show.width, show.height);
                }
            }
        },

        // ---- 3. The long winter --------------------------------------
        {
            id: "winter",
            ms: 11000,
            title: "ONE HUNDRED AND SEVENTY YEARS LATER",
            track: "intro",
            camera: [
                { t: 0, x: -200, y: 60, zoom: 1.0 },
                { t: 1, x: 200,  y: 30, zoom: 1.08 }
            ],
            lines: [
                { at: 900,  who: "narrator", text: "Ash fell for a decade. Then the rain came, and kept coming." },
                { at: 4600, who: "narrator", text: "The towers are still standing. Hollow, but standing." },
                { at: 8000, who: "narrator", text: "And last winter, something on the old relay started transmitting again." }
            ],
            draw(ctx, camera, elapsed, progress) {
                drawGradientSky(ctx, [
                    [0, "#141720"], [0.5, "#20252f"], [1, "#31333a"]
                ]);
                drawSkyline(ctx, camera, 1, elapsed, 0);
                const horizon = show.height * HORIZON - camera.y * 0.4;
                drawGround(ctx, horizon, "#191b20");
                // Wet ground reflecting the sky
                const wet = ctx.createLinearGradient(0, horizon, 0, show.height);
                wet.addColorStop(0, "rgba(120,140,165,.14)");
                wet.addColorStop(1, "rgba(120,140,165,0)");
                ctx.fillStyle = wet;
                ctx.fillRect(0, horizon, show.width, show.height - horizon);
                // A lone figure crossing the frame, lit from behind
                const walkX = show.width * (0.15 + progress * 0.55) - camera.x * 0.2;
                const walkY = horizon + show.height * 0.04;
                drawLightShaft(ctx, walkX + 40, horizon - show.height * 0.3, 60, show.height * 0.42, "rgba(190,210,235,.12)", 1);
                drawPortrait(ctx, "you", walkX, walkY, show.height * 0.16, elapsed);
                drawRain(ctx, 0.8, elapsed);
                drawAsh(ctx, 0.25, elapsed);
            }
        },

        // ---- 4. The survivors ----------------------------------------
        {
            id: "survivors",
            ms: 14000,
            title: null,
            track: "city",
            camera: [
                { t: 0,   x: 0,  y: 0,  zoom: 1.5 },
                { t: 0.5, x: 30, y: -8, zoom: 1.32 },
                { t: 1,   x: -20, y: 6, zoom: 1.4 }
            ],
            lines: [
                { at: 500,  who: "tomas", text: "Three of us made it to the ridge. Found a camp, a dead beacon and half a toolkit." },
                { at: 4600, who: "mara",  text: "The beacon can be fixed. Power, antenna, signal — three modules. Then anyone still out there can hear us." },
                { at: 8600, who: "vex",   text: "And whatever took the grid down will hear us too. Build the walls first." },
                { at: 11600, who: "mara", text: "Then we had better build fast." }
            ],
            draw(ctx, camera, elapsed, progress) {
                drawGradientSky(ctx, [
                    [0, "#0b0f18"], [0.6, "#1b1a22"], [1, "#2a2026"]
                ]);
                // Distant ruins, heavily parallaxed and very dark
                drawSkyline(ctx, { x: camera.x * 0.3, y: camera.y, zoom: camera.zoom * 0.55 }, 1, elapsed, 0);
                const horizon = show.height * (HORIZON - 0.02);
                drawGround(ctx, horizon, "#120f12");
                // The camp: fire in the middle, three silhouettes around it.
                // Everything is measured up from the horizon so the figures
                // stand clear of the dialogue plate at any window size.
                const fireX = show.width * 0.5 - camera.x * 0.6;
                const fireY = horizon + show.height * 0.03;
                const size = show.height * 0.2;
                drawCampfire(ctx, fireX, fireY, show.height / 620, elapsed);
                drawPortrait(ctx, "tomas", fireX - show.width * 0.22, fireY - size * 0.06, size, elapsed);
                drawPortrait(ctx, "mara",  fireX + show.width * 0.21, fireY - size * 0.06, size, elapsed + 900);
                drawPortrait(ctx, "vex",   fireX + show.width * 0.36, fireY - size * 0.01, size * 0.84, elapsed + 1800);
                // The dead beacon tower behind them, dark until the last beat
                const towerX = show.width * 0.16 - camera.x * 0.8;
                ctx.strokeStyle = "#20242c";
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(towerX - 16, horizon);
                ctx.lineTo(towerX, horizon - show.height * 0.3);
                ctx.lineTo(towerX + 16, horizon);
                ctx.stroke();
                for (let i = 1; i < 5; i++) {
                    const y = horizon - (show.height * 0.3 / 5) * i;
                    const w = 16 * (1 - i / 5.5);
                    ctx.beginPath();
                    ctx.moveTo(towerX - w, y);
                    ctx.lineTo(towerX + w, y);
                    ctx.stroke();
                }
                if (progress > 0.82) {
                    const spark = clamp01((progress - 0.82) / 0.18);
                    const blink = (Math.sin(elapsed * 0.02) + 1) / 2;
                    ctx.fillStyle = "rgba(255,90,70," + (spark * blink).toFixed(2) + ")";
                    ctx.beginPath();
                    ctx.arc(towerX, horizon - show.height * 0.3 - 4, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
                drawAsh(ctx, 0.4, elapsed);
            }
        },

        // ---- 5. Title ------------------------------------------------
        {
            id: "title",
            ms: 9000,
            title: null,
            track: "city",
            camera: [
                { t: 0, x: 0, y: 40, zoom: 1.6 },
                { t: 1, x: 0, y: -30, zoom: 0.95 }
            ],
            lines: [
                { at: 4200, who: "narrator", text: "One camp. One beacon. One more chance." }
            ],
            draw(ctx, camera, elapsed, progress) {
                drawGradientSky(ctx, [
                    [0, "#0a1018"], [0.5, "#152033"], [1, "#2d2a3a"]
                ]);
                // Dawn breaking behind the outpost
                const dawn = clamp01((progress - 0.2) / 0.6);
                const sunY = show.height * (0.66 - dawn * 0.1);
                const sun = ctx.createRadialGradient(show.width * 0.5, sunY, 0, show.width * 0.5, sunY, show.height * 0.75);
                sun.addColorStop(0, "rgba(255,190,120," + (0.4 * dawn).toFixed(2) + ")");
                sun.addColorStop(1, "rgba(255,150,90,0)");
                ctx.fillStyle = sun;
                ctx.fillRect(0, 0, show.width, show.height);
                drawSkyline(ctx, { x: camera.x * 0.4, y: camera.y, zoom: camera.zoom * 0.7 }, 0.92, elapsed, 0);
                const horizon = show.height * (HORIZON + 0.02) - camera.y * 0.3;
                drawGround(ctx, horizon, "#10131a");
                // The outpost silhouette: tents, a workshop and the lit beacon
                const baseX = show.width * 0.5 - camera.x;
                const scale = show.height / 540 * camera.zoom;
                ctx.fillStyle = "#171a22";
                for (const [dx, w, h] of [[-150, 60, 26], [-70, 46, 20], [40, 80, 34], [150, 54, 24]]) {
                    ctx.beginPath();
                    ctx.moveTo(baseX + dx * scale, horizon);
                    ctx.lineTo(baseX + (dx + w / 2) * scale, horizon - h * scale);
                    ctx.lineTo(baseX + (dx + w) * scale, horizon);
                    ctx.closePath();
                    ctx.fill();
                }
                drawCampfire(ctx, baseX - 20 * scale, horizon + 10 * scale, scale * 0.8, elapsed);
                // Beacon, now alight and sweeping
                const beaconX = baseX + 110 * scale;
                const beaconTop = horizon - show.height * 0.26 * camera.zoom;
                ctx.strokeStyle = "#232834";
                ctx.lineWidth = 3 * scale;
                ctx.beginPath();
                ctx.moveTo(beaconX - 14 * scale, horizon);
                ctx.lineTo(beaconX, beaconTop);
                ctx.lineTo(beaconX + 14 * scale, horizon);
                ctx.stroke();
                const sweep = (elapsed * 0.0012) % (Math.PI * 2);
                drawLightShaft(ctx, beaconX, beaconTop, show.width * 0.16,
                    show.height * 0.5, "rgba(255,200,120,.3)", 0.5 + Math.sin(sweep) * 0.3);
                const pulse = (Math.sin(elapsed * 0.006) + 1) / 2;
                ctx.fillStyle = "rgba(255,200,120," + (0.6 + pulse * 0.4).toFixed(2) + ")";
                ctx.beginPath();
                ctx.arc(beaconX, beaconTop, 5 * scale, 0, Math.PI * 2);
                ctx.fill();
                drawAsh(ctx, 0.18, elapsed);

                // Title card, letter-spaced in as the camera pulls back
                if (progress > 0.3) {
                    const reveal = clamp01((progress - 0.3) / 0.35);
                    ctx.save();
                    ctx.textAlign = "center";
                    ctx.globalAlpha = reveal;
                    const titleSize = Math.min(86, show.width * 0.11);
                    ctx.font = "800 " + titleSize + "px Inter, Arial, sans-serif";
                    ctx.letterSpacing = (24 - reveal * 16).toFixed(1) + "px";
                    ctx.fillStyle = "rgba(0,0,0,.55)";
                    ctx.fillText("LAST CITY", show.width / 2 + 3, show.height * 0.38 + 3);
                    const fill = ctx.createLinearGradient(0, show.height * 0.3, 0, show.height * 0.42);
                    fill.addColorStop(0, "#fff6e4");
                    fill.addColorStop(1, "#ffc247");
                    ctx.fillStyle = fill;
                    ctx.fillText("LAST CITY", show.width / 2, show.height * 0.38);
                    ctx.letterSpacing = "6px";
                    ctx.font = "600 " + Math.min(17, show.width * 0.022) + "px Inter, Arial, sans-serif";
                    ctx.fillStyle = "rgba(240,246,252,.78)";
                    ctx.globalAlpha = clamp01((progress - 0.5) / 0.3);
                    ctx.fillText("CTRL + ALT + DEFEAT", show.width / 2, show.height * 0.45);
                    ctx.restore();
                }
            }
        }
    ];

    // Small colour mixer used by the collapse scene's sky.
    function lerpColor(from, to, t) {
        const parse = hex => {
            const value = hex.replace("#", "");
            const num = parseInt(value, 16);
            return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
        };
        const a = parse(from), b = parse(to);
        const mix = a.map((channel, i) => Math.round(lerp(channel, b[i], clamp01(t))));
        return "rgb(" + mix.join(",") + ")";
    }

    const TOTAL_MS = SCENES.reduce((sum, scene) => sum + scene.ms, 0);

    // ---------------------------------------------------------------
    // The stage
    //
    // A fixed overlay holding the canvas plus the DOM furniture (dialogue,
    // skip button, progress). Dialogue is DOM rather than canvas text so it is
    // selectable, screen-reader friendly and scales with the user's font size.
    // ---------------------------------------------------------------

    function buildStage() {
        if (show.root) return show.root;
        // A native <dialog>, not a positioned <div>. The game's start screen is
        // itself a modal dialog, which the browser paints in the top layer —
        // ABOVE everything with a z-index. A div here would render behind the
        // start screen and swallow none of its clicks, so the cinematic has to
        // join the same top layer to be seen and to be clickable.
        const root = document.createElement("dialog");
        root.id = "cinematicStage";
        root.className = "cinematic-stage";
        root.setAttribute("aria-label", "Opening cinematic");
        root.innerHTML =
            '<canvas id="cinematicCanvas" aria-hidden="true"></canvas>' +
            '<div class="cine-letterbox cine-top" aria-hidden="true"></div>' +
            '<div class="cine-letterbox cine-bottom" aria-hidden="true"></div>' +
            '<div class="cine-grain" aria-hidden="true"></div>' +
            '<p class="cine-chapter" id="cineChapter" aria-hidden="true"></p>' +
            '<div class="cine-dialogue" id="cineDialogue" aria-live="polite">' +
              '<p class="cine-speaker" id="cineSpeaker"></p>' +
              '<p class="cine-text" id="cineText"></p>' +
            '</div>' +
            '<div class="cine-controls">' +
              '<div class="cine-progress" id="cineProgress" aria-hidden="true"></div>' +
              '<button type="button" id="cineSkip" class="cine-skip">Skip intro <span aria-hidden="true">⏭</span></button>' +
            '</div>';
        document.body.appendChild(root);
        show.root = root;
        show.canvas = document.getElementById("cinematicCanvas");
        show.ctx = show.canvas?.getContext("2d") || null;

        document.getElementById("cineSkip")?.addEventListener("click", event => {
            event.stopPropagation();
            finish("skipped");
        });
        // A tap anywhere advances to the next line, which is how a player who
        // reads quickly gets through the sequence without skipping it.
        root.addEventListener("click", () => advanceLine());
        root.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); advanceLine(); }
        });
        // Escape reaches a dialog as "cancel". Treat it as Skip so the key does
        // something predictable rather than closing the stage mid-sequence
        // without finishing the hand-off back to the game.
        root.addEventListener("cancel", event => {
            event.preventDefault();
            finish("skipped");
        });

        const dots = document.getElementById("cineProgress");
        if (dots) {
            dots.innerHTML = SCENES.map((scene, index) =>
                '<i data-scene="' + index + '"></i>').join("");
        }
        return root;
    }

    function resize() {
        if (!show.canvas) return;
        const width = global.innerWidth || 1024;
        const height = global.innerHeight || 640;
        const dpr = Math.min(2, global.devicePixelRatio || 1);
        show.width = width;
        show.height = height;
        show.dpr = dpr;
        show.canvas.width = Math.round(width * dpr);
        show.canvas.height = Math.round(height * dpr);
        show.canvas.style.width = width + "px";
        show.canvas.style.height = height + "px";
    }

    // ---------------------------------------------------------------
    // Dialogue
    // ---------------------------------------------------------------

    // Flattened [sceneIndex, line] pairs with absolute start times, so the
    // player can jump forward through lines regardless of scene boundaries.
    function timeline() {
        const entries = [];
        let offset = 0;
        SCENES.forEach((scene, index) => {
            for (const line of scene.lines || []) {
                entries.push({ scene: index, at: offset + line.at, who: line.who, text: line.text });
            }
            offset += scene.ms;
        });
        return entries.sort((a, b) => a.at - b.at);
    }

    const LINES = timeline();

    function currentLineIndex(elapsed) {
        let index = -1;
        for (let i = 0; i < LINES.length; i++) if (LINES[i].at <= elapsed) index = i;
        return index;
    }

    function renderLine(index, elapsed) {
        const speaker = document.getElementById("cineSpeaker");
        const text = document.getElementById("cineText");
        const box = document.getElementById("cineDialogue");
        if (!speaker || !text || !box) return;
        if (index < 0) { box.classList.remove("visible"); return; }
        const line = LINES[index];
        const person = CAST[line.who] || CAST.narrator;

        if (show.lineIndex !== index) {
            show.lineIndex = index;
            show.lineStart = elapsed;
            speaker.textContent = person.name;
            speaker.style.color = person.color;
            speaker.hidden = !person.name;
            text.textContent = "";
            box.classList.add("visible");
            box.classList.toggle("narrator", line.who === "narrator");
        }

        // Typewriter: 26ms a character, which reads comfortably aloud.
        const chars = show.reduced
            ? line.text.length
            : Math.floor(Math.max(0, elapsed - show.lineStart) / 26);
        const shown = line.text.slice(0, chars);
        if (text.textContent !== shown) {
            text.textContent = shown;
            // One soft blip every few characters rather than every character.
            if (chars % 3 === 0 && chars < line.text.length) EX()?.sfx("dialogueBlip");
        }
    }

    // Jump to the next line: completes the current one first, which is the
    // behaviour players expect from a visual-novel style advance.
    function advanceLine() {
        if (!show.running) return;
        const elapsed = show.now - show.startedAt;
        const index = show.lineIndex;
        if (index >= 0) {
            const line = LINES[index];
            const typed = Math.floor(Math.max(0, elapsed - show.lineStart) / 26);
            if (typed < line.text.length) {
                // Finish typing instantly.
                show.lineStart = elapsed - line.text.length * 26;
                const text = document.getElementById("cineText");
                if (text) text.textContent = line.text;
                return;
            }
        }
        const next = LINES[index + 1];
        if (!next) { finish("completed"); return; }
        show.startedAt = show.now - next.at;
        EX()?.sfx("uiTap");
    }

    // ---------------------------------------------------------------
    // Frame
    // ---------------------------------------------------------------

    function sceneAt(elapsed) {
        let offset = 0;
        for (let i = 0; i < SCENES.length; i++) {
            if (elapsed < offset + SCENES[i].ms) {
                return { scene: SCENES[i], index: i, local: elapsed - offset };
            }
            offset += SCENES[i].ms;
        }
        return { scene: SCENES[SCENES.length - 1], index: SCENES.length - 1, local: SCENES[SCENES.length - 1].ms };
    }

    function frame(now) {
        if (!show.running) return;
        show.now = now;
        const ctx = show.ctx;
        if (!ctx) { finish("error"); return; }

        const elapsed = now - show.startedAt;
        if (elapsed >= TOTAL_MS) { finish("completed"); return; }

        const { scene, index, local } = sceneAt(elapsed);
        const progress = clamp01(local / scene.ms);

        if (index !== show.sceneIndex) {
            show.sceneIndex = index;
            onSceneStart(scene, index);
        }

        ctx.setTransform(show.dpr, 0, 0, show.dpr, 0, 0);
        ctx.clearRect(0, 0, show.width, show.height);

        // Scripted camera shakes for the collapse.
        if (scene.shakeAt) {
            for (const moment of scene.shakeAt) {
                if (Math.abs(local - moment) < 40) show.shake = 16;
            }
        }
        ctx.save();
        if (show.shake > 0.4) {
            ctx.translate((Math.random() - 0.5) * show.shake, (Math.random() - 0.5) * show.shake);
            show.shake *= 0.88;
        }

        const camera = cameraAt(scene.camera, progress);
        scene.draw(ctx, camera, now, progress);
        ctx.restore();

        // Scene cross-fades: the last and first 500ms of every scene dip to
        // black, which hides the hard cut between two very different shots.
        const fadeIn = clamp01(local / 500);
        const fadeOut = clamp01((scene.ms - local) / 500);
        const fade = Math.min(fadeIn, fadeOut);
        if (fade < 1) {
            ctx.fillStyle = "rgba(0,0,0," + (1 - fade).toFixed(3) + ")";
            ctx.fillRect(0, 0, show.width, show.height);
        }
        // Opening fade from black over the first beat of the whole sequence.
        if (elapsed < 900) {
            ctx.fillStyle = "rgba(0,0,0," + (1 - elapsed / 900).toFixed(3) + ")";
            ctx.fillRect(0, 0, show.width, show.height);
        }

        if (show.flash > 0.01) {
            ctx.fillStyle = "rgba(255,240,220," + show.flash.toFixed(3) + ")";
            ctx.fillRect(0, 0, show.width, show.height);
            show.flash *= 0.86;
        }

        renderLine(currentLineIndex(elapsed), elapsed);
        updateProgressDots(index, progress);

        show.raf = global.requestAnimationFrame(frame);
    }

    function updateProgressDots(index, progress) {
        const dots = document.getElementById("cineProgress");
        if (!dots) return;
        const children = dots.children;
        for (let i = 0; i < children.length; i++) {
            const state = i < index ? "done" : i === index ? "active" : "";
            if (children[i].dataset.state !== state) {
                children[i].dataset.state = state;
                children[i].className = state;
            }
            if (i === index) children[i].style.setProperty("--p", Math.round(progress * 100) + "%");
        }
    }

    function onSceneStart(scene, index) {
        const chapter = document.getElementById("cineChapter");
        if (chapter) {
            chapter.textContent = scene.title || "";
            chapter.classList.remove("show");
            if (scene.title) {
                // Re-trigger the CSS animation.
                void chapter.offsetWidth;
                chapter.classList.add("show");
            }
        }
        if (index === 1) { show.flash = 0.8; EX()?.sfx("explosion"); }
        if (index === 4) EX()?.sfx("bigReward");
        if (scene.track && global.LastCityAudio) {
            if (global.LastCityAudio.currentTrack?.() !== scene.track) {
                global.LastCityAudio.playMusic?.(scene.track, { fade: 1.6 });
            }
        }
    }

    // ---------------------------------------------------------------
    // Reduced motion
    //
    // Rather than animating, draw one still frame per scene and page through
    // them with the dialogue. The story is identical; only the motion is gone.
    // ---------------------------------------------------------------

    function renderStill(index) {
        const ctx = show.ctx;
        if (!ctx) return;
        const scene = SCENES[Math.max(0, Math.min(SCENES.length - 1, index))];
        ctx.setTransform(show.dpr, 0, 0, show.dpr, 0, 0);
        ctx.clearRect(0, 0, show.width, show.height);
        const camera = cameraAt(scene.camera, 0.55);
        // A fixed timestamp, so nothing in the still frame animates.
        scene.draw(ctx, camera, 4000, 0.55);
        const chapter = document.getElementById("cineChapter");
        if (chapter) {
            chapter.textContent = scene.title || "";
            chapter.classList.toggle("show", !!scene.title);
        }
        updateProgressDots(index, 1);
    }

    function runStoryboard() {
        let lineCursor = 0;
        show.lineIndex = -1;
        const step = () => {
            if (!show.running) return;
            if (lineCursor >= LINES.length) { finish("completed"); return; }
            const line = LINES[lineCursor];
            renderStill(line.scene);
            show.lineIndex = -1;
            show.lineStart = 0;
            show.now = performance.now();
            renderLine(lineCursor, 1e9);   // reduced mode prints the line whole
            lineCursor++;
        };
        step();
        show.storyboardAdvance = step;
        const root = show.root;
        if (root) {
            root.classList.add("cine-static");
            // In reduced-motion mode a tap pages forward rather than
            // fast-forwarding an animation.
            root.addEventListener("click", step);
        }
    }

    // ---------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------

    function shouldAutoPlay() {
        const state = exp();
        if (!state) return false;
        if (state.cinematic.seenVersion >= VERSION) return false;
        return true;
    }

    function play(options = {}) {
        if (show.running) return Promise.resolve("already-running");
        const state = exp();
        if (!state) return Promise.resolve("no-state");

        buildStage();
        resize();
        seedParticles();
        buildSkyline();

        show.reduced = !EX()?.motionAllowed();
        show.running = true;
        show.finished = false;
        show.skipping = false;
        show.sceneIndex = -1;
        show.lineIndex = -1;
        show.lightsOut = 0;
        show.shake = 0;
        show.flash = 0;
        show.startedAt = performance.now();
        show.now = show.startedAt;

        document.body.classList.add("cinematic-open");
        if (!show.root.open) {
            try { show.root.showModal(); }
            catch (_) { show.root.setAttribute("open", ""); }
        }
        show.root.classList.add("open");
        show.root.tabIndex = -1;
        document.getElementById("cineSkip")?.focus?.({ preventScroll: true });

        global.addEventListener("resize", resize);

        global.LastCityAudio?.unlock?.();
        global.LastCityAudio?.playMusic?.("intro", { fade: 2.2 });

        state.cinematic.plays++;
        if (!options.replay) state.cinematic.seenVersion = VERSION;

        if (show.reduced) {
            runStoryboard();
        } else {
            show.raf = global.requestAnimationFrame(frame);
        }

        return new Promise(resolve => { show.resolve = resolve; });
    }

    function finish(reason) {
        if (!show.running || show.finished) return;
        show.finished = true;
        show.running = false;
        if (show.raf) global.cancelAnimationFrame(show.raf);
        show.raf = null;
        global.removeEventListener("resize", resize);

        const state = exp();
        if (state) {
            state.cinematic.seenVersion = VERSION;
            if (reason === "skipped") state.cinematic.skipped = true;
        }

        if (show.root) {
            show.root.classList.remove("open");
            show.root.classList.add("closing");
            const root = show.root;
            const cleanup = () => {
                root.classList.remove("closing", "cine-static");
                try { if (root.open) root.close(); } catch (_) { root.removeAttribute("open"); }
                document.body.classList.remove("cinematic-open");
            };
            if (EX()?.motionAllowed()) global.setTimeout(cleanup, 620);
            else cleanup();
        }

        global.LastCityAudio?.stopMusic?.(1.4);
        EX()?.save();

        const resolve = show.resolve;
        show.resolve = null;
        if (resolve) resolve(reason);
    }

    // ---------------------------------------------------------------
    // Integration with the original start screen
    //
    // The original game wires its PLAY button straight to launchCityTerminal().
    // Rather than editing that, a capture-phase listener on `document` runs
    // first, plays the cinematic if it is due, and then calls the original
    // handler itself. If this module fails to load, the PLAY button keeps its
    // original behaviour untouched.
    // ---------------------------------------------------------------

    let intercepting = false;

    function interceptStart() {
        document.addEventListener("click", event => {
            const button = event.target?.closest?.("#introStartButton, #startContinueButton");
            if (!button || intercepting) return;
            if (!shouldAutoPlay()) return;
            // Take over this click.
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            intercepting = true;
            play().then(() => {
                intercepting = false;
                // Hand control back to the game's own start path.
                if (typeof global.launchCityTerminal === "function") global.launchCityTerminal();
                else button.click();
            }).catch(() => {
                intercepting = false;
                if (typeof global.launchCityTerminal === "function") global.launchCityTerminal();
            });
        }, true);
    }

    function init() {
        interceptStart();
    }

    // A seek hook for the automated tests, so each scene can be captured and
    // checked without waiting out the whole sequence in real time.
    global.__cineSeek = function (ms) {
        if (!show.running) return false;
        show.startedAt = performance.now() - ms;
        show.lineIndex = -1;
        show.sceneIndex = -1;
        return true;
    };

    global.LastCityExpansion?.register?.("cinematic", {
        init,
        play,
        // Exposed for the tests and the Settings replay button.
        _finish: finish,
        _scenes: SCENES,
        _lines: LINES,
        _totalMs: TOTAL_MS,
        shouldAutoPlay,
        isRunning: () => show.running
    });
})(typeof window !== "undefined" ? window : globalThis);
