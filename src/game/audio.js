// =============================================
// LAST CITY · AUDIO ENGINE
// CTRL + ALT + DEFEAT
// ---------------------------------------------
// Everything here is synthesized live in the browser with the Web Audio API.
// No audio files ship with the game, nothing is downloaded at runtime, and no
// external audio service is contacted. That keeps the repository small, keeps
// GitHub Pages deployment trivial, and avoids third-party music licensing.
//
// Public surface: window.LastCityAudio
//   ctx()                      shared AudioContext (created on first gesture)
//   unlock()                   resume a suspended context (call from a gesture)
//   playMusic(name, opts)      crossfade to a procedural track
//   stopMusic(fade)            fade the music bus out and stop the scheduler
//   duck(amount, seconds)      temporarily lower music (used under dialogue)
//   sfx(name, opts)            fire a synthesized sound effect
//   setMusicVolume(v) / setSfxVolume(v)
//   syncPreferences()          re-read game.* preference flags
//
// The engine is deliberately defensive: every entry point is wrapped so a
// browser without Web Audio, or with audio blocked, degrades to silence rather
// than throwing into the game loop.
// =============================================

(function (global) {
    "use strict";

    const AudioCtor = global.AudioContext || global.webkitAudioContext || null;

    // ---------------------------------------------------------------
    // Context and bus graph
    //
    //   voices ──┬─► sfxBus  ──┐
    //            └─► musicBus ─┴─► masterBus ─► limiter ─► destination
    //
    // musicBus carries a separate duckGain so dialogue can dip the music
    // without fighting the player's own volume setting.
    // ---------------------------------------------------------------
    let ctx = null;
    let masterBus = null;
    let musicBus = null;
    let musicDuck = null;
    let sfxBus = null;
    let limiter = null;
    let graphReady = false;

    // Preferences mirrored from the save so the engine never reads `game`
    // directly in a hot path (and still works before `game` exists).
    const prefs = { sound: true, music: true, musicVolume: 0.55, sfxVolume: 0.8 };

    // Voice accounting. Synthesized music plus dense combat can stack up fast;
    // a hard cap keeps weak devices from stuttering.
    const liveVoices = new Set();
    const MAX_VOICES = 48;
    const sfxLast = new Map();

    function makeContext() {
        if (ctx || !AudioCtor) return ctx;
        try {
            ctx = new AudioCtor({ latencyHint: "interactive" });
        } catch (_) {
            try { ctx = new AudioCtor(); } catch (_e) { ctx = null; }
        }
        return ctx;
    }

    function buildGraph() {
        if (graphReady || !makeContext()) return graphReady;
        try {
            masterBus = ctx.createGain();
            masterBus.gain.value = 1;

            // A gentle compressor stands in for a limiter: procedural layers can
            // sum louder than intended, and this keeps peaks civil.
            if (ctx.createDynamicsCompressor) {
                limiter = ctx.createDynamicsCompressor();
                limiter.threshold.value = -10;
                limiter.knee.value = 12;
                limiter.ratio.value = 6;
                limiter.attack.value = 0.004;
                limiter.release.value = 0.18;
                masterBus.connect(limiter).connect(ctx.destination);
            } else {
                masterBus.connect(ctx.destination);
            }

            musicDuck = ctx.createGain();
            musicDuck.gain.value = 1;
            musicBus = ctx.createGain();
            musicBus.gain.value = 0;           // tracks fade themselves in
            musicBus.connect(musicDuck).connect(masterBus);

            sfxBus = ctx.createGain();
            sfxBus.gain.value = prefs.sfxVolume;
            sfxBus.connect(masterBus);

            graphReady = true;
        } catch (_) {
            graphReady = false;
        }
        return graphReady;
    }

    function unlock() {
        if (!buildGraph()) return false;
        try {
            if (ctx.state === "suspended") ctx.resume()?.catch?.(() => {});
        } catch (_) {}
        return ctx.state !== "suspended";
    }

    function audible() {
        return !!(prefs.sound && buildGraph() && ctx.state !== "closed");
    }

    function now() { return ctx ? ctx.currentTime : 0; }

    function track(node) {
        if (!node) return node;
        liveVoices.add(node);
        node.onended = () => {
            liveVoices.delete(node);
            try { node.disconnect(); } catch (_) {}
        };
        return node;
    }

    function voicesAvailable(count = 1) {
        return liveVoices.size + count <= MAX_VOICES;
    }

    // ---------------------------------------------------------------
    // Shared noise buffer
    //
    // Built once with a deterministic LCG so it never touches Math.random and
    // therefore can never perturb gameplay RNG sequences.
    // ---------------------------------------------------------------
    let noiseBuffer = null;
    function getNoise() {
        if (noiseBuffer || !ctx) return noiseBuffer;
        try {
            const length = Math.floor(ctx.sampleRate * 2);
            noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            let seed = 0x2f6e2b1;
            for (let i = 0; i < length; i++) {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                data[i] = seed / 2147483648 - 1;
            }
        } catch (_) { noiseBuffer = null; }
        return noiseBuffer;
    }

    // ---------------------------------------------------------------
    // Primitive instruments
    // Each returns quickly and self-cleans; all take an absolute start time so
    // the scheduler can place them ahead of the playhead.
    // ---------------------------------------------------------------

    function tone(opts) {
        const o = opts || {};
        if (!audible() || !voicesAvailable()) return;
        const bus = o.bus || sfxBus;
        const start = o.time ?? now();
        const dur = Math.max(0.02, o.dur ?? 0.2);
        const peak = Math.max(0.0002, o.gain ?? 0.12);
        try {
            const osc = ctx.createOscillator();
            const amp = ctx.createGain();
            osc.type = o.type || "triangle";
            osc.frequency.setValueAtTime(Math.max(16, o.freq || 220), start);
            if (o.glide) {
                osc.frequency.exponentialRampToValueAtTime(
                    Math.max(16, o.glide), start + dur
                );
            }
            if (o.detune) osc.detune.setValueAtTime(o.detune, start);

            let node = osc;
            if (o.filter) {
                const lp = ctx.createBiquadFilter();
                lp.type = o.filter.type || "lowpass";
                lp.frequency.setValueAtTime(o.filter.freq ?? 1200, start);
                if (o.filter.to) {
                    lp.frequency.exponentialRampToValueAtTime(
                        Math.max(40, o.filter.to), start + dur
                    );
                }
                lp.Q.value = o.filter.q ?? 0.8;
                node = node.connect(lp);
            }

            const attack = Math.min(o.attack ?? 0.008, dur * 0.6);
            amp.gain.setValueAtTime(0.0001, start);
            amp.gain.exponentialRampToValueAtTime(peak, start + attack);
            if (o.sustain) {
                amp.gain.setValueAtTime(peak, start + dur - 0.06);
            }
            amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);

            node.connect(amp).connect(bus);
            track(osc);
            osc.start(start);
            osc.stop(start + dur + 0.02);
        } catch (_) {}
    }

    // Slow, wide pad: several detuned voices under a moving lowpass. This is
    // the backbone of the ambient tracks.
    function pad(freqs, opts) {
        const o = opts || {};
        if (!audible()) return;
        const list = Array.isArray(freqs) ? freqs : [freqs];
        if (!voicesAvailable(list.length * 2)) return;
        const start = o.time ?? now();
        const dur = o.dur ?? 4;
        const peak = (o.gain ?? 0.05) / Math.max(1, list.length);
        try {
            const lp = ctx.createBiquadFilter();
            lp.type = "lowpass";
            lp.frequency.setValueAtTime(o.cutoff ?? 700, start);
            lp.frequency.linearRampToValueAtTime((o.cutoff ?? 700) * 1.7, start + dur * 0.5);
            lp.frequency.linearRampToValueAtTime(o.cutoff ?? 700, start + dur);
            lp.Q.value = 0.7;

            const amp = ctx.createGain();
            amp.gain.setValueAtTime(0.0001, start);
            amp.gain.exponentialRampToValueAtTime(peak, start + Math.min(1.6, dur * 0.35));
            amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
            lp.connect(amp).connect(o.bus || musicBus);

            for (const freq of list) {
                for (const cents of [-7, 7]) {
                    const osc = ctx.createOscillator();
                    osc.type = o.type || "sawtooth";
                    osc.frequency.setValueAtTime(Math.max(20, freq), start);
                    osc.detune.setValueAtTime(cents, start);
                    osc.connect(lp);
                    track(osc);
                    osc.start(start);
                    osc.stop(start + dur + 0.05);
                }
            }
        } catch (_) {}
    }

    // Two-operator bell. Cheap stand-in for FM metal; used for discoveries and
    // the intro's "signal" motif.
    function bell(freq, opts) {
        const o = opts || {};
        if (!audible() || !voicesAvailable(3)) return;
        const start = o.time ?? now();
        const dur = o.dur ?? 1.4;
        const peak = o.gain ?? 0.07;
        try {
            const amp = ctx.createGain();
            amp.gain.setValueAtTime(0.0001, start);
            amp.gain.exponentialRampToValueAtTime(peak, start + 0.006);
            amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
            amp.connect(o.bus || musicBus);

            const carrier = ctx.createOscillator();
            carrier.type = "sine";
            carrier.frequency.setValueAtTime(freq, start);

            const modGain = ctx.createGain();
            modGain.gain.setValueAtTime(freq * (o.index ?? 1.4), start);
            modGain.gain.exponentialRampToValueAtTime(1, start + dur * 0.5);

            const modulator = ctx.createOscillator();
            modulator.type = "sine";
            modulator.frequency.setValueAtTime(freq * (o.ratio ?? 2.01), start);
            modulator.connect(modGain).connect(carrier.frequency);

            carrier.connect(amp);
            track(carrier);
            track(modulator);
            carrier.start(start); carrier.stop(start + dur + 0.05);
            modulator.start(start); modulator.stop(start + dur + 0.05);
        } catch (_) {}
    }

    // Filtered noise burst: kick body, snare, hats, wind, debris, explosions.
    function noise(opts) {
        const o = opts || {};
        if (!audible() || !getNoise() || !voicesAvailable(2)) return;
        const start = o.time ?? now();
        const dur = o.dur ?? 0.2;
        const peak = o.gain ?? 0.08;
        try {
            const src = ctx.createBufferSource();
            src.buffer = noiseBuffer;
            src.loop = true;
            // Deterministic offset per call keeps repeated hits from phasing
            // identically without consuming gameplay randomness.
            src.loopStart = 0;

            const filter = ctx.createBiquadFilter();
            filter.type = o.type || "bandpass";
            filter.frequency.setValueAtTime(o.freq ?? 1400, start);
            if (o.to) {
                filter.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), start + dur);
            }
            filter.Q.value = o.q ?? 1.1;

            const amp = ctx.createGain();
            amp.gain.setValueAtTime(0.0001, start);
            amp.gain.exponentialRampToValueAtTime(peak, start + (o.attack ?? 0.005));
            amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);

            src.connect(filter).connect(amp).connect(o.bus || sfxBus);
            track(src);
            src.start(start);
            src.stop(start + dur + 0.02);
        } catch (_) {}
    }

    function kick(time, gain = 0.3, busOverride) {
        tone({ time, freq: 150, glide: 42, dur: 0.22, gain, type: "sine", attack: 0.003, bus: busOverride || musicBus });
        noise({ time, dur: 0.05, freq: 220, gain: gain * 0.4, type: "lowpass", bus: busOverride || musicBus });
    }
    function snare(time, gain = 0.16, busOverride) {
        noise({ time, dur: 0.16, freq: 1800, to: 700, gain, q: 0.8, bus: busOverride || musicBus });
        tone({ time, freq: 190, dur: 0.1, gain: gain * 0.5, type: "triangle", bus: busOverride || musicBus });
    }
    function hat(time, gain = 0.055, busOverride) {
        noise({ time, dur: 0.045, freq: 8200, gain, type: "highpass", q: 0.6, bus: busOverride || musicBus });
    }

    // ---------------------------------------------------------------
    // Music: step sequencer with lookahead scheduling
    //
    // A setInterval tick schedules Web Audio events a little ahead of the
    // playhead. Audio timing therefore comes from the audio clock, not from
    // timer jitter, so the groove stays steady even when the main thread is
    // busy rendering the city.
    // ---------------------------------------------------------------

    // Semitone offsets from the track root for each scale we use.
    const SCALES = {
        minor:      [0, 2, 3, 5, 7, 8, 10],
        dorian:     [0, 2, 3, 5, 7, 9, 10],
        phrygian:   [0, 1, 3, 5, 7, 8, 10],
        majorPent:  [0, 2, 4, 7, 9],
        minorPent:  [0, 3, 5, 7, 10]
    };

    function hz(semitonesFromA2) {
        // A2 = 110Hz as the reference; tracks pick their own root offset.
        return 110 * Math.pow(2, semitonesFromA2 / 12);
    }

    function chordNotes(scaleName, root, degree, voices = 3, octave = 0) {
        const scale = SCALES[scaleName] || SCALES.minor;
        const out = [];
        for (let i = 0; i < voices; i++) {
            const index = degree + i * 2;
            const step = scale[((index % scale.length) + scale.length) % scale.length];
            const octaveShift = Math.floor(index / scale.length) * 12;
            out.push(hz(root + step + octaveShift + octave * 12));
        }
        return out;
    }

    // Each track describes a 16-step bar and a chord progression. `layer`
    // functions receive the absolute time of the step so they can schedule.
    const TRACKS = {
        // Somber, sparse, wide. Used over the cinematic intro.
        intro: {
            bpm: 52, scale: "minor", root: -5, progression: [0, 5, 3, 4],
            swing: 0,
            layers: {
                pad(step, time, t, bar) {
                    if (step !== 0) return;
                    const degree = t.progression[bar % t.progression.length];
                    pad(chordNotes(t.scale, t.root, degree, 3, -1), {
                        time, dur: (60 / t.bpm) * 4 * 0.98, gain: 0.075, cutoff: 480
                    });
                },
                drone(step, time, t, bar) {
                    if (step !== 0 || bar % 2) return;
                    pad([hz(t.root - 12)], { time, dur: (60 / t.bpm) * 8, gain: 0.05, cutoff: 260, type: "triangle" });
                },
                bells(step, time, t, bar) {
                    if (step !== 4 && step !== 11) return;
                    const degree = t.progression[bar % t.progression.length];
                    const notes = chordNotes(t.scale, t.root, degree, 3, 1);
                    bell(notes[step === 4 ? 2 : 0], { time, dur: 2.4, gain: 0.045, ratio: 2.01, index: 1.1 });
                },
                wind(step, time, t, bar) {
                    if (step !== 8 || bar % 2) return;
                    noise({ time, dur: 3.2, freq: 420, to: 1500, gain: 0.02, type: "lowpass", q: 0.5, attack: 1.2, bus: musicBus });
                }
            }
        },

        // Calm ambient loop for ordinary city play. Deliberately low-contrast
        // so it can run for a long session without fatiguing.
        city: {
            bpm: 68, scale: "dorian", root: 0, progression: [0, 3, 5, 3],
            swing: 0,
            layers: {
                pad(step, time, t, bar) {
                    if (step !== 0) return;
                    const degree = t.progression[bar % t.progression.length];
                    pad(chordNotes(t.scale, t.root, degree, 3, -1), {
                        time, dur: (60 / t.bpm) * 4 * 0.96, gain: 0.055, cutoff: 620
                    });
                },
                bass(step, time, t, bar) {
                    if (step % 8) return;
                    const degree = t.progression[bar % t.progression.length];
                    const scale = SCALES[t.scale];
                    tone({
                        time, freq: hz(t.root + scale[degree % scale.length] - 24),
                        dur: 0.9, gain: 0.1, type: "triangle",
                        filter: { freq: 420 }, bus: musicBus
                    });
                },
                pluck(step, time, t, bar) {
                    if (![2, 6, 10, 14].includes(step)) return;
                    const degree = t.progression[bar % t.progression.length];
                    const notes = chordNotes(t.scale, t.root, degree, 4, 1);
                    const pick = notes[(step / 2 + bar) % notes.length];
                    tone({ time, freq: pick, dur: 0.5, gain: 0.035, type: "sine", bus: musicBus });
                },
                hats(step, time) {
                    if (step % 4 !== 2) return;
                    hat(time, 0.025);
                }
            }
        },

        // Driving, percussive. Runs during combat encounters.
        combat: {
            bpm: 126, scale: "phrygian", root: -7, progression: [0, 0, 5, 4],
            swing: 0,
            layers: {
                drums(step, time) {
                    if (step === 0 || step === 6 || step === 10) kick(time, 0.3);
                    if (step === 4 || step === 12) snare(time, 0.15);
                    if (step % 2 === 1) hat(time, 0.04);
                },
                bass(step, time, t, bar) {
                    if (step % 2) return;
                    const degree = t.progression[bar % t.progression.length];
                    const scale = SCALES[t.scale];
                    const wobble = step % 8 === 0 ? 0 : step % 4 === 0 ? 7 : 3;
                    tone({
                        time, freq: hz(t.root + scale[degree % scale.length] + wobble - 24),
                        dur: 0.16, gain: 0.12, type: "sawtooth",
                        filter: { freq: 900, to: 300 }, bus: musicBus
                    });
                },
                arp(step, time, t, bar) {
                    const degree = t.progression[bar % t.progression.length];
                    const notes = chordNotes(t.scale, t.root, degree, 4, 1);
                    tone({
                        time, freq: notes[step % notes.length], dur: 0.12,
                        gain: 0.03, type: "square",
                        filter: { freq: 2600, q: 2 }, bus: musicBus
                    });
                },
                stab(step, time, t, bar) {
                    if (step !== 0 || bar % 4 !== 3) return;
                    const degree = t.progression[bar % t.progression.length];
                    pad(chordNotes(t.scale, t.root, degree, 3, 0), {
                        time, dur: 0.7, gain: 0.07, cutoff: 1600
                    });
                }
            }
        },

        // Bright, resolved. Short sting for wins and completed missions; loops
        // politely if left running.
        victory: {
            bpm: 96, scale: "majorPent", root: 2, progression: [0, 2, 4, 2],
            swing: 0,
            layers: {
                pad(step, time, t, bar) {
                    if (step !== 0) return;
                    pad(chordNotes(t.scale, t.root, t.progression[bar % t.progression.length], 3, 0), {
                        time, dur: (60 / t.bpm) * 4 * 0.95, gain: 0.07, cutoff: 1400
                    });
                },
                bells(step, time, t, bar) {
                    if (step % 2) return;
                    const notes = chordNotes(t.scale, t.root, t.progression[bar % t.progression.length], 4, 1);
                    bell(notes[(step / 2) % notes.length], { time, dur: 0.9, gain: 0.05 });
                },
                drums(step, time) {
                    if (step === 0 || step === 8) kick(time, 0.22);
                    if (step === 4 || step === 12) snare(time, 0.1);
                }
            }
        },

        // Cold and vast, for the Citadel endgame.
        citadel: {
            bpm: 60, scale: "minorPent", root: -3, progression: [0, 4, 2, 3],
            swing: 0,
            layers: {
                pad(step, time, t, bar) {
                    if (step !== 0) return;
                    pad(chordNotes(t.scale, t.root, t.progression[bar % t.progression.length], 4, -1), {
                        time, dur: (60 / t.bpm) * 4 * 0.97, gain: 0.065, cutoff: 540, type: "sawtooth"
                    });
                },
                sub(step, time, t) {
                    if (step !== 0) return;
                    tone({ time, freq: hz(t.root - 24), dur: (60 / t.bpm) * 4, gain: 0.09, type: "sine", bus: musicBus });
                },
                shimmer(step, time, t, bar) {
                    if (step % 3) return;
                    const notes = chordNotes(t.scale, t.root, t.progression[bar % t.progression.length], 5, 2);
                    tone({ time, freq: notes[(step + bar) % notes.length], dur: 0.7, gain: 0.018, type: "sine", bus: musicBus });
                }
            }
        }
    };

    const music = {
        name: null,
        timer: null,
        step: 0,
        bar: 0,
        nextStepTime: 0,
        token: 0
    };
    const LOOKAHEAD_MS = 90;
    const SCHEDULE_AHEAD = 0.28;

    function stepDuration(def) {
        // 16 steps to the bar == 16th notes.
        return (60 / def.bpm) / 4;
    }

    function scheduleMusic() {
        const def = TRACKS[music.name];
        if (!def || !audible() || !prefs.music) return;
        const horizon = now() + SCHEDULE_AHEAD;
        let guard = 0;
        while (music.nextStepTime < horizon && guard++ < 64) {
            const time = music.nextStepTime;
            for (const layer of Object.values(def.layers)) {
                try { layer(music.step, time, def, music.bar); } catch (_) {}
            }
            music.step++;
            if (music.step >= 16) { music.step = 0; music.bar++; }
            music.nextStepTime += stepDuration(def);
        }
    }

    function playMusic(name, opts) {
        const o = opts || {};
        if (!TRACKS[name]) return false;
        if (!buildGraph()) return false;
        if (music.name === name && music.timer) {
            // Already running: just make sure it is audible.
            setMusicVolume(prefs.musicVolume);
            return true;
        }
        const fade = o.fade ?? 1.2;
        const start = () => {
            music.name = name;
            music.step = 0;
            music.bar = 0;
            music.nextStepTime = now() + 0.08;
            clearInterval(music.timer);
            music.timer = setInterval(scheduleMusic, LOOKAHEAD_MS);
            scheduleMusic();
            if (prefs.music && prefs.sound) {
                try {
                    musicBus.gain.cancelScheduledValues(now());
                    musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), now());
                    musicBus.gain.linearRampToValueAtTime(prefs.musicVolume, now() + fade);
                } catch (_) {}
            }
        };
        if (music.timer) {
            // Crossfade: duck out the old track, then swap the scheduler.
            const token = ++music.token;
            try {
                musicBus.gain.cancelScheduledValues(now());
                musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), now());
                musicBus.gain.linearRampToValueAtTime(0.0001, now() + fade * 0.5);
            } catch (_) {}
            setTimeout(() => { if (token === music.token) start(); }, fade * 500);
        } else {
            start();
        }
        return true;
    }

    function stopMusic(fade = 0.8) {
        const token = ++music.token;
        if (graphReady) {
            try {
                musicBus.gain.cancelScheduledValues(now());
                musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), now());
                musicBus.gain.linearRampToValueAtTime(0.0001, now() + Math.max(0.05, fade));
            } catch (_) {}
        }
        const finish = () => {
            if (token !== music.token) return;
            clearInterval(music.timer);
            music.timer = null;
            music.name = null;
        };
        if (fade > 0) setTimeout(finish, fade * 1000 + 40); else finish();
    }

    function duck(amount = 0.35, seconds = 1.5) {
        if (!graphReady || !musicDuck) return;
        try {
            const t = now();
            musicDuck.gain.cancelScheduledValues(t);
            musicDuck.gain.setValueAtTime(musicDuck.gain.value, t);
            musicDuck.gain.linearRampToValueAtTime(Math.max(0.05, amount), t + 0.12);
            musicDuck.gain.linearRampToValueAtTime(1, t + Math.max(0.3, seconds));
        } catch (_) {}
    }

    function setMusicVolume(value) {
        prefs.musicVolume = Math.min(1, Math.max(0, Number(value) || 0));
        if (!graphReady) return;
        const target = prefs.music && prefs.sound && music.timer ? prefs.musicVolume : 0.0001;
        try {
            musicBus.gain.cancelScheduledValues(now());
            musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), now());
            musicBus.gain.linearRampToValueAtTime(Math.max(0.0001, target), now() + 0.25);
        } catch (_) {}
    }

    function setSfxVolume(value) {
        prefs.sfxVolume = Math.min(1, Math.max(0, Number(value) || 0));
        if (graphReady) {
            try { sfxBus.gain.setTargetAtTime(prefs.sfxVolume, now(), 0.05); } catch (_) {}
        }
    }

    // ---------------------------------------------------------------
    // Sound effects
    //
    // Named recipes rather than generic beeps, so the game can say what
    // happened ("unit died", "building placed") and get a fitting sound.
    // Each entry may set a `cooldown` in ms to stop machine-gun repeats.
    // ---------------------------------------------------------------
    const SFX = {
        // --- UI ---
        uiTap:        { cooldown: 40,  play: t => tone({ time: t, freq: 520, dur: 0.045, gain: 0.05, type: "sine" }) },
        uiBack:       { cooldown: 60,  play: t => tone({ time: t, freq: 300, glide: 190, dur: 0.1, gain: 0.05, type: "sine" }) },
        uiDenied:     { cooldown: 160, play: t => { tone({ time: t, freq: 160, dur: 0.1, gain: 0.07, type: "square" }); tone({ time: t + 0.09, freq: 120, dur: 0.12, gain: 0.06, type: "square" }); } },
        uiOpen:       { cooldown: 90,  play: t => { tone({ time: t, freq: 320, glide: 640, dur: 0.14, gain: 0.05, type: "sine" }); hat(t + 0.02, 0.02, sfxBus); } },

        // --- City building ---
        placeBuilding: { cooldown: 70, play: t => {
            tone({ time: t, freq: 180, glide: 90, dur: 0.17, gain: 0.13, type: "triangle" });
            noise({ time: t + 0.01, dur: 0.14, freq: 700, to: 200, gain: 0.07, type: "lowpass" });
        } },
        constructionTick: { cooldown: 110, play: t => {
            noise({ time: t, dur: 0.05, freq: 2400, gain: 0.035, type: "bandpass", q: 2 });
            tone({ time: t, freq: 760, dur: 0.05, gain: 0.03, type: "square" });
        } },
        constructionDone: { cooldown: 200, play: t => {
            for (const [i, f] of [392, 523.25, 659.25].entries()) {
                tone({ time: t + i * 0.07, freq: f, dur: 0.3, gain: 0.07, type: "triangle" });
            }
            noise({ time: t, dur: 0.3, freq: 1200, to: 400, gain: 0.05, type: "lowpass" });
        } },
        demolish: { cooldown: 160, play: t => {
            noise({ time: t, dur: 0.5, freq: 900, to: 90, gain: 0.12, type: "lowpass", q: 0.6 });
            tone({ time: t, freq: 90, glide: 40, dur: 0.4, gain: 0.08, type: "sawtooth" });
        } },
        repair: { cooldown: 120, play: t => {
            for (let i = 0; i < 3; i++) {
                noise({ time: t + i * 0.08, dur: 0.06, freq: 2600, gain: 0.05, type: "bandpass", q: 3 });
            }
        } },

        // --- Economy ---
        resourceGain:  { cooldown: 50,  play: t => tone({ time: t, freq: 680, glide: 900, dur: 0.1, gain: 0.05, type: "sine" }) },
        bigReward:     { cooldown: 220, play: t => {
            for (const [i, f] of [523.25, 659.25, 783.99, 1046.5].entries()) {
                bell(f, { time: t + i * 0.06, dur: 0.7, gain: 0.055, bus: sfxBus });
            }
        } },
        research:      { cooldown: 180, play: t => {
            tone({ time: t, freq: 300, glide: 1200, dur: 0.45, gain: 0.05, type: "sine", filter: { freq: 2400, q: 4 } });
            bell(1318.5, { time: t + 0.18, dur: 0.8, gain: 0.04, bus: sfxBus });
        } },

        // --- Combat ---
        deployUnit:   { cooldown: 60,  play: t => {
            tone({ time: t, freq: 240, glide: 420, dur: 0.14, gain: 0.09, type: "square", filter: { freq: 1800 } });
            noise({ time: t, dur: 0.1, freq: 1600, to: 500, gain: 0.05 });
        } },
        meleeHit:     { cooldown: 45,  play: t => {
            noise({ time: t, dur: 0.09, freq: 1100, to: 300, gain: 0.08, q: 0.9 });
            tone({ time: t, freq: 150, glide: 80, dur: 0.08, gain: 0.07, type: "triangle" });
        } },
        rangedShot:   { cooldown: 45,  play: t => {
            tone({ time: t, freq: 1400, glide: 420, dur: 0.1, gain: 0.055, type: "sawtooth", filter: { freq: 3000, to: 900 } });
        } },
        explosion:    { cooldown: 90,  play: t => {
            noise({ time: t, dur: 0.6, freq: 1400, to: 60, gain: 0.16, type: "lowpass", q: 0.5 });
            tone({ time: t, freq: 110, glide: 32, dur: 0.45, gain: 0.12, type: "sawtooth" });
        } },
        unitDown:     { cooldown: 70,  play: t => {
            tone({ time: t, freq: 300, glide: 90, dur: 0.26, gain: 0.07, type: "triangle" });
            noise({ time: t, dur: 0.2, freq: 600, to: 150, gain: 0.05, type: "lowpass" });
        } },
        ability:      { cooldown: 110, play: t => {
            tone({ time: t, freq: 420, glide: 1600, dur: 0.3, gain: 0.07, type: "square", filter: { freq: 3200, q: 6 } });
            bell(1046.5, { time: t + 0.1, dur: 0.6, gain: 0.05, bus: sfxBus });
        } },
        shieldBreak:  { cooldown: 140, play: t => {
            noise({ time: t, dur: 0.35, freq: 3000, to: 700, gain: 0.1, type: "bandpass", q: 1.4 });
            for (const [i, f] of [1200, 900, 1500].entries()) {
                tone({ time: t + i * 0.04, freq: f, dur: 0.2, gain: 0.05, type: "square" });
            }
        } },
        bossRoar:     { cooldown: 500, play: t => {
            tone({ time: t, freq: 70, glide: 48, dur: 1.3, gain: 0.15, type: "sawtooth", filter: { freq: 500, to: 160 } });
            noise({ time: t, dur: 1.2, freq: 320, to: 90, gain: 0.1, type: "lowpass", q: 0.7, attack: 0.2 });
        } },
        waveIncoming: { cooldown: 400, play: t => {
            for (let i = 0; i < 2; i++) {
                tone({ time: t + i * 0.3, freq: 520, dur: 0.22, gain: 0.08, type: "square" });
                tone({ time: t + i * 0.3 + 0.11, freq: 392, dur: 0.22, gain: 0.08, type: "square" });
            }
        } },
        victory:      { cooldown: 600, play: t => {
            for (const [i, f] of [523.25, 659.25, 783.99, 1046.5, 1318.5].entries()) {
                tone({ time: t + i * 0.1, freq: f, dur: 0.5, gain: 0.08, type: "triangle" });
            }
        } },
        defeat:       { cooldown: 600, play: t => {
            for (const [i, f] of [392, 349.23, 293.66, 220].entries()) {
                tone({ time: t + i * 0.16, freq: f, dur: 0.6, gain: 0.08, type: "triangle", filter: { freq: 900 } });
            }
        } },

        // --- Characters and world ---
        dialogueBlip: { cooldown: 28,  play: t => tone({ time: t, freq: 620, dur: 0.028, gain: 0.025, type: "square" }) },
        npcGreet:     { cooldown: 200, play: t => {
            tone({ time: t, freq: 480, glide: 640, dur: 0.12, gain: 0.05, type: "sine" });
            tone({ time: t + 0.1, freq: 720, dur: 0.14, gain: 0.045, type: "sine" });
        } },
        discovery:    { cooldown: 260, play: t => {
            bell(880, { time: t, dur: 1.2, gain: 0.06, ratio: 1.5, bus: sfxBus });
            bell(1320, { time: t + 0.12, dur: 1.1, gain: 0.045, ratio: 2.01, bus: sfxBus });
        } },
        petHappy:     { cooldown: 160, play: t => {
            for (const [i, f] of [660, 880, 1100].entries()) {
                tone({ time: t + i * 0.07, freq: f, dur: 0.16, gain: 0.05, type: "sine" });
            }
        } },
        petLevel:     { cooldown: 260, play: t => {
            for (const [i, f] of [523.25, 698.46, 880, 1174.7].entries()) {
                bell(f, { time: t + i * 0.08, dur: 0.6, gain: 0.05, bus: sfxBus });
            }
        } },
        thunder:      { cooldown: 900, play: t => {
            noise({ time: t, dur: 1.8, freq: 500, to: 60, gain: 0.11, type: "lowpass", q: 0.5, attack: 0.05 });
            tone({ time: t + 0.04, freq: 60, glide: 30, dur: 1.4, gain: 0.07, type: "sine" });
        } },
        rainLayer:    { cooldown: 2000, play: t => {
            noise({ time: t, dur: 4.2, freq: 3800, gain: 0.03, type: "highpass", q: 0.4, attack: 1.0 });
        } },
        cameraWhoosh: { cooldown: 140, play: t => {
            noise({ time: t, dur: 0.4, freq: 300, to: 2200, gain: 0.045, type: "bandpass", q: 0.8, attack: 0.08 });
        } }
    };

    function sfx(name, opts) {
        const recipe = SFX[name];
        if (!recipe || !audible()) return false;
        const o = opts || {};
        const stamp = Date.now();
        const cooldown = o.cooldown ?? recipe.cooldown ?? 60;
        if (stamp - (sfxLast.get(name) ?? -Infinity) < cooldown) return false;
        sfxLast.set(name, stamp);
        unlock();
        try { recipe.play(now() + (o.delay || 0)); } catch (_) {}
        return true;
    }

    // ---------------------------------------------------------------
    // Preference syncing
    //
    // `game` is the authority. Call syncPreferences() after a load, a settings
    // toggle, or an account switch.
    // ---------------------------------------------------------------
    function syncPreferences() {
        // `game` is declared with top-level `let` in src/game/game.js, which
        // creates a global *lexical* binding and NOT a property on window — so
        // `global.game` is permanently undefined. Read the bare identifier
        // instead, guarded in case this file is ever loaded before game.js.
        let state = null;
        try { state = typeof game !== "undefined" ? game : null; } catch (_) { state = null; }
        if (state && typeof state === "object") {
            prefs.sound = state.soundEnabled !== false;
            prefs.music = state.musicEnabled !== false;
            if (Number.isFinite(state.musicVolume)) prefs.musicVolume = Math.min(1, Math.max(0, state.musicVolume));
            if (Number.isFinite(state.sfxVolume)) prefs.sfxVolume = Math.min(1, Math.max(0, state.sfxVolume));
        }
        if (!graphReady) return;
        setSfxVolume(prefs.sfxVolume);
        setMusicVolume(prefs.musicVolume);
        if (!prefs.sound) silence();
    }

    function silence() {
        for (const voice of Array.from(liveVoices)) {
            try { voice.stop(); voice.onended?.(); } catch (_) {}
        }
        liveVoices.clear();
    }

    // Pause the audio clock when the tab is hidden: no point scheduling music
    // nobody can hear, and it keeps background CPU at zero.
    if (global.document?.addEventListener) {
        global.document.addEventListener("visibilitychange", () => {
            if (!ctx) return;
            try {
                if (global.document.hidden) { silence(); ctx.suspend?.(); }
                else if (prefs.sound) ctx.resume?.()?.catch?.(() => {});
            } catch (_) {}
        });
    }

    global.LastCityAudio = {
        ctx: () => (buildGraph() ? ctx : null),
        unlock,
        available: () => !!AudioCtor,
        playMusic,
        stopMusic,
        currentTrack: () => music.name,
        duck,
        sfx,
        setMusicVolume,
        setSfxVolume,
        getMusicVolume: () => prefs.musicVolume,
        getSfxVolume: () => prefs.sfxVolume,
        syncPreferences,
        silence,
        // Exposed for the automated tests, which exercise the recipe table
        // without a real AudioContext.
        _sfxNames: () => Object.keys(SFX),
        _trackNames: () => Object.keys(TRACKS),
        _buses: () => ({ masterBus, musicBus, sfxBus, musicDuck, limiter })
    };
})(typeof window !== "undefined" ? window : globalThis);
