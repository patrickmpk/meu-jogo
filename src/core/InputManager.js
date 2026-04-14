/**
 * InputManager.js
 * Gerencia todos os inputs: teclado, mouse e Pointer Lock API.
 * Expõe estado de teclas e delta do mouse para os sistemas de jogo.
 */

export class InputManager {
  constructor() {
    // ── Estado do teclado ────────────────────────────────────
    /** @type {Set<string>} teclas atualmente pressionadas */
    this.keys = new Set();

    // ── Estado do mouse ──────────────────────────────────────
    /** Acumulador de movimento do mouse (resetado a cada frame) */
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    /** Mouse button state */
    this.mouseLeft  = false;
    this.mouseRight = false;

    // ── Pointer Lock ─────────────────────────────────────────
    this.pointerLocked = false;

    // ── Callbacks externos ───────────────────────────────────
    /** @type {Function|null} chamado quando pointer lock é adquirido */
    this.onLock   = null;
    /** @type {Function|null} chamado quando pointer lock é liberado */
    this.onUnlock = null;
    /** @type {Function|null} chamado a cada clique (LMB) com pointer locked */
    this.onShoot  = null;
    /** @type {Function|null} chamado ao pressionar R */
    this.onReload = null;

    this._bindEvents();
  }

  /** Registra todos os event listeners */
  _bindEvents() {
    // Teclado
    window.addEventListener('keydown', e => this._onKeyDown(e));
    window.addEventListener('keyup',   e => this._onKeyUp(e));

    // Mouse move (só funciona com pointer lock ativo)
    document.addEventListener('mousemove', e => this._onMouseMove(e));

    // Mouse buttons
    document.addEventListener('mousedown', e => this._onMouseDown(e));
    document.addEventListener('mouseup',   e => this._onMouseUp(e));

    // Pointer Lock change
    document.addEventListener('pointerlockchange', () => this._onPointerLockChange());
    document.addEventListener('pointerlockerror',  () => {
      console.warn('[InputManager] Pointer Lock falhou.');
    });
  }

  // ── Keyboard ──────────────────────────────────────────────

  _onKeyDown(e) {
    this.keys.add(e.code);

    if (e.code === 'KeyR' && this.pointerLocked) {
      this.onReload?.();
    }

    // Previne scroll da página com setas / espaço
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
  }

  /** Verifica se uma tecla está pressionada */
  isDown(code) {
    return this.keys.has(code);
  }

  // ── Mouse ─────────────────────────────────────────────────

  _onMouseMove(e) {
    if (!this.pointerLocked) return;
    // movementX/Y acumulam o delta bruto (não clampado pelo viewport)
    this.mouseDeltaX += e.movementX ?? e.mozMovementX ?? 0;
    this.mouseDeltaY += e.movementY ?? e.mozMovementY ?? 0;
  }

  _onMouseDown(e) {
    if (e.button === 0) {
      this.mouseLeft = true;
      if (this.pointerLocked) this.onShoot?.();
    }
    if (e.button === 2) this.mouseRight = true;
  }

  _onMouseUp(e) {
    if (e.button === 0) this.mouseLeft = false;
    if (e.button === 2) this.mouseRight = false;
  }

  /**
   * Consome o delta acumulado do mouse e retorna o valor.
   * Deve ser chamado UMA vez por frame.
   * @returns {{ x: number, y: number }}
   */
  consumeMouseDelta() {
    const d = { x: this.mouseDeltaX, y: this.mouseDeltaY };
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return d;
  }

  // ── Pointer Lock ──────────────────────────────────────────

  /** Solicita pointer lock no elemento alvo (geralmente o canvas) */
  requestLock(element) {
    element.requestPointerLock();
  }

  /** Libera o pointer lock */
  releaseLock() {
    document.exitPointerLock();
  }

  _onPointerLockChange() {
    const wasLocked = this.pointerLocked;
    this.pointerLocked = document.pointerLockElement !== null;

    if (this.pointerLocked && !wasLocked) {
      this.onLock?.();
    } else if (!this.pointerLocked && wasLocked) {
      this.keys.clear(); // limpa teclas ao pausar
      this.onUnlock?.();
    }
  }

  /** Destrói os event listeners (limpeza) */
  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup',   this._onMouseUp);
  }
}
