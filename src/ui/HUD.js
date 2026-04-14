/**
 * HUD.js
 * Interface do jogador: vida, munição, pontuação, onda,
 * barra de recarga, kill feed e overlays de dano/game over.
 */

export class HUD {
  constructor() {
    // ── Elementos DOM ──────────────────────────────────────
    this._hud         = document.getElementById('hud');
    this._healthVal   = document.getElementById('healthValue');
    this._healthFill  = document.getElementById('healthFill');
    this._ammoVal     = document.getElementById('ammoValue');
    this._ammoIcons   = document.getElementById('ammoIcons');
    this._scoreVal    = document.getElementById('scoreValue');
    this._waveVal     = document.getElementById('waveValue');
    this._waveNotif   = document.getElementById('waveNotif');
    this._hitFlash    = document.getElementById('hitFlash');
    this._reloadBar   = document.getElementById('reloadBar');
    this._reloadFill  = document.getElementById('reloadFill');
    this._killFeed    = document.getElementById('killFeed');
    this._gameOverPanel = document.getElementById('gameOverPanel');
    this._finalScore  = document.getElementById('finalScore');
    this._pauseMsg    = document.getElementById('pauseMsg');

    this._hitFlashTimer = 0;
    this._waveTimer     = 0;
    this._maxMag        = 30;
  }

  // ── Visibilidade ──────────────────────────────────────────

  show() { this._hud.style.display = 'block'; }
  hide() { this._hud.style.display = 'none';  }

  // ── Vida ─────────────────────────────────────────────────

  /**
   * @param {number} hp    - vida atual
   * @param {number} maxHp - vida máxima
   */
  setHealth(hp, maxHp) {
    const pct = Math.max(0, hp / maxHp) * 100;
    this._healthVal.textContent = Math.ceil(hp);

    this._healthFill.style.width = `${pct}%`;

    // Cor da barra por % de vida
    if (pct > 60) {
      this._healthFill.style.background = 'linear-gradient(90deg,#4caf50,#8bc34a)';
      this._healthVal.style.color = '#4caf50';
    } else if (pct > 30) {
      this._healthFill.style.background = 'linear-gradient(90deg,#ff9800,#ffc107)';
      this._healthVal.style.color = '#ff9800';
    } else {
      this._healthFill.style.background = 'linear-gradient(90deg,#f44336,#e91e63)';
      this._healthVal.style.color = '#f44336';
      // Pulsa quando vida baixa
      this._healthVal.style.animation = pct < 15 ? 'none' : '';
    }
  }

  // ── Munição ───────────────────────────────────────────────

  /**
   * @param {number} mag     - balas no pente
   * @param {number} reserve - balas na reserva
   * @param {number} maxMag  - tamanho máximo do pente
   */
  setAmmo(mag, reserve, maxMag) {
    this._maxMag = maxMag;
    this._ammoVal.textContent = `${mag} / ${reserve}`;

    // Cor de aviso
    if (mag <= 5)       this._ammoVal.style.color = '#f44336';
    else if (mag <= 10) this._ammoVal.style.color = '#ff9800';
    else                this._ammoVal.style.color = '#fff';

    // Ícones de bala
    this._ammoIcons.innerHTML = '';
    for (let i = 0; i < Math.min(maxMag, 30); i++) {
      const span = document.createElement('span');
      span.className = 'bullet-icon' + (i >= mag ? ' empty' : '');
      this._ammoIcons.appendChild(span);
    }
  }

  // ── Pontuação ─────────────────────────────────────────────

  setScore(score) {
    this._scoreVal.textContent = score.toLocaleString('pt-BR');

    // Efeito de scale pop
    this._scoreVal.style.transform = 'scale(1.4)';
    this._scoreVal.style.transition = 'transform .15s';
    setTimeout(() => {
      this._scoreVal.style.transform = 'scale(1)';
    }, 150);
  }

  // ── Onda ─────────────────────────────────────────────────

  setWave(wave) {
    this._waveVal.textContent = wave;
  }

  showWaveNotification(wave) {
    this._waveNotif.textContent = `ONDA ${wave}`;
    this._waveNotif.style.opacity = '1';
    clearTimeout(this._waveTimeout);
    this._waveTimeout = setTimeout(() => {
      this._waveNotif.style.opacity = '0';
    }, 2200);
  }

  // ── Recarga ───────────────────────────────────────────────

  /**
   * @param {boolean} reloading
   * @param {number}  progress  - 0 a 1
   * @param {number}  duration  - duração total em ms (para transition)
   */
  setReloading(reloading, progress, duration = 1800) {
    if (reloading) {
      this._reloadBar.style.display = 'block';
      this._reloadFill.style.transition = `width ${duration}ms linear`;
      this._reloadFill.style.width = `${progress * 100}%`;
    } else {
      this._reloadBar.style.display = 'none';
      this._reloadFill.style.width = '0%';
    }
  }

  // ── Hit flash (dano) ─────────────────────────────────────

  triggerHitFlash() {
    this._hitFlash.style.opacity = '0.5';
    clearTimeout(this._hitTimeout);
    this._hitTimeout = setTimeout(() => {
      this._hitFlash.style.opacity = '0';
    }, 120);
  }

  // ── Kill feed ─────────────────────────────────────────────

  addKillMessage(msg = 'Inimigo eliminado!') {
    const div = document.createElement('div');
    div.className = 'kill-msg';
    div.textContent = `☠ ${msg}`;
    this._killFeed.appendChild(div);

    // Remove após animação
    setTimeout(() => {
      if (div.parentNode) div.parentNode.removeChild(div);
    }, 2600);
  }

  // ── Pausa ─────────────────────────────────────────────────

  setPaused(paused) {
    this._pauseMsg.style.display = paused ? 'block' : 'none';
  }

  // ── Game Over ─────────────────────────────────────────────

  showGameOver(score, wave, kills) {
    this._gameOverPanel.style.display = 'flex';
    this._finalScore.innerHTML =
      `Pontuação Final: <strong style="color:#f5c518">${score.toLocaleString('pt-BR')}</strong><br>
       Onda: <strong>${wave}</strong> &nbsp;|&nbsp; Abates: <strong>${kills}</strong>`;
  }

  hideGameOver() {
    this._gameOverPanel.style.display = 'none';
  }

  // ── Update por frame ─────────────────────────────────────
  // Chamado pelo loop principal para quaisquer atualizações de frame

  update(dt, weapon) {
    // Atualiza barra de recarga em tempo real
    if (weapon.isReloading) {
      this.setReloading(true, weapon.reloadProgress);
    } else if (this._reloadBar.style.display !== 'none') {
      this.setReloading(false, 0);
    }
  }
}
