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

  /**
   * @param {number}      score
   * @param {number}      wave
   * @param {number}      kills
   * @param {number|null} rank      - posição no ranking (opcional)
   * @param {object|null} rankTier  - objeto da tier (opcional)
   */
  showGameOver(score, wave, kills, rank = null, rankTier = null) {
    this._gameOverPanel.style.display = 'flex';

    const TIER_STYLE = {
      legend:   { color:'#FFD700', emoji:'👑' },
      diamond:  { color:'#B9F2FF', emoji:'💎' },
      platinum: { color:'#E5E4E2', emoji:'🏆' },
      gold:     { color:'#FFA500', emoji:'🥇' },
      silver:   { color:'#C0C0C0', emoji:'🥈' },
      bronze:   { color:'#CD7F32', emoji:'🥉' },
    };

    let rankHtml = '';
    if (rank) {
      const ts = rankTier ? (TIER_STYLE[rankTier.id] || {}) : {};
      rankHtml = `
        <div style="margin:10px 0;padding:10px 18px;background:rgba(255,215,0,.08);
                    border:1px solid rgba(255,215,0,.25);border-radius:8px;text-align:center">
          <div style="font-size:.8rem;color:#aaa;letter-spacing:.1em;margin-bottom:4px">SEU RANK NO RANKING MENSAL</div>
          <div style="font-size:1.6rem;font-weight:800;color:#FFD700">
            ${ts.emoji || '🎮'} #${rank}
            ${rankTier ? `<span style="font-size:.9rem;color:${ts.color || '#fff'}">${rankTier.label || ''}</span>` : ''}
          </div>
          <div style="font-size:.75rem;color:#aaa;margin-top:4px">
            ${rank <= 100 ? '🪂 Você está elegível para recompensas diárias!' : 'Continue jogando para entrar no top 100!'}
          </div>
        </div>`;
    }

    this._finalScore.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
        <div>Pontuação: <strong style="color:#f5c518;font-size:1.3rem">${score.toLocaleString('pt-BR')}</strong></div>
        <div style="font-size:.9rem;color:#aaa">Onda ${wave} &nbsp;|&nbsp; ${kills} abates</div>
        ${rankHtml}
      </div>`;
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
