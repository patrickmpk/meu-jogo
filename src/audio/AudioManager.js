/**
 * AudioManager.js
 * Gerencia efeitos sonoros usando a Web Audio API.
 * Gera sons procedurais (sem arquivos externos necessários).
 */

export class AudioManager {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.enabled = true;
    this.masterGain = null;
  }

  /** Inicializa o AudioContext (deve ser chamado após interação do usuário) */
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.6;
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('[AudioManager] Web Audio API não disponível.', e);
      this.enabled = false;
    }
  }

  /** Resume o contexto (necessário em alguns browsers após suspensão) */
  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  // ── Helpers internos ──────────────────────────────────────

  /**
   * Cria um oscilador simples.
   * @param {string} type - 'sine'|'square'|'sawtooth'|'triangle'
   * @param {number} freq - frequência em Hz
   * @param {number} startTime
   * @param {number} duration
   * @param {GainNode} destNode
   */
  _playTone(type, freq, startTime, duration, destNode, freqEnd = null) {
    if (!this.ctx || !this.enabled) return;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    if (freqEnd !== null) {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration);
    }

    gain.gain.setValueAtTime(1, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(destNode);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  /**
   * Gera ruído branco (burst) via ScriptProcessor / AudioWorklet fallback.
   */
  _playNoise(startTime, duration, gainVal, destNode) {
    if (!this.ctx || !this.enabled) return;
    const bufferSize = Math.ceil(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data   = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainVal, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    source.connect(gain);
    gain.connect(destNode);
    source.start(startTime);
  }

  // ── Sons do jogo ──────────────────────────────────────────

  /** Som de tiro */
  playShoot() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Clique inicial (noise burst)
    this._playNoise(t, 0.05, 0.8, this.masterGain);

    // Corpo do disparo (tone sweep descendente)
    this._playTone('sawtooth', 220, t, 0.12, this.masterGain, 80);

    // Eco curto
    this._playNoise(t + 0.06, 0.08, 0.3, this.masterGain);
  }

  /** Som de reload */
  playReload() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    // Click metálico 1
    this._playTone('square', 1200, t,        0.04, this.masterGain, 600);
    // Click metálico 2
    this._playTone('square',  800, t + 0.25, 0.04, this.masterGain, 400);
    // Encaixe do pente
    this._playNoise(t + 0.5, 0.06, 0.5, this.masterGain);
  }

  /** Som de inimigo morto */
  playEnemyDie() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    this._playTone('sawtooth', 300, t, 0.2, this.masterGain, 80);
    this._playNoise(t, 0.15, 0.4, this.masterGain);
  }

  /** Som de dano recebido */
  playHurt() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    this._playTone('sine', 180, t, 0.18, this.masterGain, 100);
    this._playNoise(t, 0.1, 0.3, this.masterGain);
  }

  /** Som de clique seco (sem bala) */
  playEmpty() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    this._playTone('square', 800, t, 0.03, this.masterGain, 700);
  }

  /** Som de nova onda */
  playWaveStart() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    [440, 550, 660].forEach((f, i) => {
      this._playTone('sine', f, t + i * 0.12, 0.18, this.masterGain);
    });
  }

  /** Som de game over */
  playGameOver() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    [440, 330, 220, 110].forEach((f, i) => {
      this._playTone('sawtooth', f, t + i * 0.18, 0.22, this.masterGain);
    });
  }

  /** Ajusta volume master (0–1) */
  setVolume(v) {
    if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(1, v));
  }
}
