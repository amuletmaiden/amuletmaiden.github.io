import { deriveSoundscape } from './soundscape-model.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let enabled = false;
let disposed = false;
let audio = null;
let lastView = deriveSoundscape(currentState);

const status = document.createElement('div');
status.setAttribute('data-visually-hidden', '');
status.setAttribute('role', 'status');
status.setAttribute('aria-live', 'polite');
status.setAttribute('aria-atomic', 'true');
(document.querySelector('#hud') ?? document.body).append(status);

function createNoiseBuffer(context) {
  const length = Math.max(1, Math.floor(context.sampleRate * 2));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let seed = 0x6d2b79f5;
  for (let index = 0; index < channel.length; index += 1) {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed) + 0x6d2b79f5 | 0;
    const value = ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
    channel[index] = value * 2 - 1;
  }
  return buffer;
}

function createAudioGraph() {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);
  const wind = context.createBufferSource();
  wind.buffer = createNoiseBuffer(context); wind.loop = true;
  const windFilter = context.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.Q.value = 0.7;
  const windGain = context.createGain(); wind.connect(windFilter).connect(windGain).connect(master);
  const tone = context.createOscillator(); tone.type = 'sine';
  const toneGain = context.createGain(); tone.connect(toneGain).connect(master);
  const crossing = context.createOscillator(); crossing.type = 'sine'; crossing.frequency.value = 48;
  const crossingGain = context.createGain(); crossing.connect(crossingGain).connect(master);
  const lfo = context.createOscillator(); lfo.type = 'sine';
  const lfoDepth = context.createGain(); lfo.connect(lfoDepth).connect(crossingGain.gain);
  wind.start(); tone.start(); crossing.start(); lfo.start();
  return { context, master, wind, windFilter, windGain, tone, toneGain, crossing, crossingGain, lfo, lfoDepth };
}

function setParam(param, value, now, seconds = 0.18) {
  const bounded = Number.isFinite(value) ? value : 0;
  param.cancelScheduledValues(now);
  param.setTargetAtTime(bounded, now, Math.max(0.015, seconds));
}

function apply(view = deriveSoundscape(currentState)) {
  lastView = view;
  if (!audio) return;
  const now = audio.context.currentTime;
  const audible = enabled && view.active;
  setParam(audio.master.gain, audible ? 0.72 : 0, now, 0.12);
  setParam(audio.windGain.gain, audible ? view.windGain : 0, now);
  setParam(audio.windFilter.frequency, view.windCutoff, now, 0.22);
  setParam(audio.tone.frequency, view.toneFrequency, now, 0.32);
  setParam(audio.toneGain.gain, audible ? view.toneGain : 0, now, 0.24);
  setParam(audio.crossingGain.gain, audible ? view.crossingGain : 0, now, 0.2);
  setParam(audio.lfo.frequency, Math.max(0.01, view.crossingRate || 0.01), now, 0.3);
  setParam(audio.lfoDepth.gain, audible && view.crossing ? Math.min(0.018, view.crossingGain * 0.36) : 0, now, 0.2);
}

function omenFrequency(soundHook) {
  const table = Object.freeze({
    'omen-answering-air': 233,
    'omen-measured-weather': 196,
    'omen-shared-silence': 174,
    'omen-same-door': 147,
    'omen-confluence': 208,
  });
  return table[soundHook] ?? null;
}

function onOmenListened(event) {
  if (!enabled || !audio || audio.context.state !== 'running') return;
  const frequency = omenFrequency(event?.detail?.soundHook);
  if (!frequency) return;
  const oscillator = audio.context.createOscillator();
  const gain = audio.context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  const now = audio.context.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.026, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.45);
  oscillator.connect(gain).connect(audio.master);
  oscillator.start(now);
  oscillator.stop(now + 1.5);
}

async function toggleSound() {
  if (disposed) return;
  if (!audio) { try { audio = createAudioGraph(); } catch { audio = null; } }
  if (!audio) { enabled = false; status.textContent = 'Soundscape unavailable.'; return; }
  enabled = !enabled;
  if (enabled && audio.context.state === 'suspended') { try { await audio.context.resume(); } catch { enabled = false; } }
  apply(lastView);
  status.textContent = enabled ? 'Soundscape on.' : 'Soundscape off.';
}

function onKeyDown(event) { if (!event.defaultPrevented && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.code === 'KeyM') void toggleSound(); }
globalThis.addEventListener?.('keydown', onKeyDown);
globalThis.addEventListener?.('greyblue:omen-listened', onOmenListened);

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true, enumerable: true,
    get() { return priorGet ? priorGet() : currentState; },
    set(value) { if (priorSet) priorSet(value); currentState = priorGet ? priorGet() : value; apply(deriveSoundscape(currentState)); },
  });
}
apply(lastView);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  globalThis.removeEventListener?.('keydown', onKeyDown);
  globalThis.removeEventListener?.('greyblue:omen-listened', onOmenListened);
  status.remove();
  if (audio) { try { audio.wind.stop(); audio.tone.stop(); audio.crossing.stop(); audio.lfo.stop(); void audio.context.close(); } catch {} }
}, { once: true });