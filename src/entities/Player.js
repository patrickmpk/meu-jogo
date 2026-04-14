/**
 * Player.js
 * Controle de primeira pessoa: câmera, movimento WASD,
 * Pointer Lock, sistema de vida e física simples.
 */

import * as THREE from 'three';

const WALK_SPEED  = 8;
const RUN_SPEED   = 14;
const MOUSE_SENS  = 0.0018;
const PLAYER_HEIGHT = 1.7;  // altura dos olhos
const PLAYER_RADIUS = 0.4;  // raio da cápsula
const MAX_PITCH     = Math.PI / 2 - 0.04; // limite de olhar para cima/baixo

const BOB_FREQ      = 8;    // frequência do head-bob
const BOB_AMP_Y     = 0.055;
const BOB_AMP_X     = 0.028;

export class Player {
  /**
   * @param {THREE.Camera}       camera
   * @param {import('../core/InputManager').InputManager} input
   * @param {import('../systems/CollisionSystem').CollisionSystem} collision
   */
  constructor(camera, input, collision) {
    this.camera    = camera;
    this.input     = input;
    this.collision = collision;

    // ── Posição e rotação ──────────────────────────────────
    /** @type {THREE.Vector3} posição dos "pés" do jogador */
    this.position = new THREE.Vector3(0, 0, 0);
    this.yaw      = 0;   // rotação horizontal (radianos)
    this.pitch    = 0;   // rotação vertical

    // ── Vida ───────────────────────────────────────────────
    this.maxHealth = 100;
    this.health    = 100;
    this.alive     = true;

    // ── Estado interno ─────────────────────────────────────
    this._velocity   = new THREE.Vector3();
    this._bobTimer   = 0;
    this._bobActive  = false;
    this._isMoving   = false;

    // ── Callbacks ──────────────────────────────────────────
    /** @type {Function|null} chamado quando jogador morre */
    this.onDeath = null;
    /** @type {Function|null} chamado quando toma dano (amount) */
    this.onHurt  = null;

    // Vetor auxiliar reutilizado
    this._dir   = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._front = new THREE.Vector3();

    // Posiciona câmera na altura dos olhos
    this._updateCamera();
  }

  // ── Update ────────────────────────────────────────────────

  /**
   * Atualiza o estado do jogador a cada frame.
   * @param {number} dt - delta time em segundos
   */
  update(dt) {
    if (!this.alive) return;
    this._handleMouse();
    this._handleMovement(dt);
    this._updateBob(dt);
    this._updateCamera();
  }

  // ── Mouse / Rotação ───────────────────────────────────────

  _handleMouse() {
    const delta = this.input.consumeMouseDelta();
    if (delta.x === 0 && delta.y === 0) return;

    this.yaw   -= delta.x * MOUSE_SENS;
    this.pitch -= delta.y * MOUSE_SENS;
    // Clampa pitch para evitar olhar além de 90°
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
  }

  // ── Movimento ─────────────────────────────────────────────

  _handleMovement(dt) {
    const inp = this.input;
    const running = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
    const speed   = running ? RUN_SPEED : WALK_SPEED;

    // Vetor frontal (ignorando componente Y — só movimento horizontal)
    this._front.set(
      Math.sin(this.yaw),
      0,
      Math.cos(this.yaw)
    );
    this._right.crossVectors(
      new THREE.Vector3(0, 1, 0),
      this._front
    ).normalize();

    this._dir.set(0, 0, 0);

    if (inp.isDown('KeyW') || inp.isDown('ArrowUp'))    this._dir.addScaledVector(this._front, -1);
    if (inp.isDown('KeyS') || inp.isDown('ArrowDown'))  this._dir.addScaledVector(this._front,  1);
    if (inp.isDown('KeyA') || inp.isDown('ArrowLeft'))  this._dir.addScaledVector(this._right, -1);
    if (inp.isDown('KeyD') || inp.isDown('ArrowRight')) this._dir.addScaledVector(this._right,  1);

    this._isMoving = this._dir.lengthSq() > 0;

    if (this._isMoving) {
      this._dir.normalize();
      this.position.addScaledVector(this._dir, speed * dt);
    }

    // ── Resolução de colisão ──────────────────────────────
    const push = this.collision.resolvePlayerCollision(
      this.position, PLAYER_RADIUS, PLAYER_HEIGHT
    );
    this.position.add(push);

    // Mantém no chão (y = 0)
    this.position.y = 0;
  }

  // ── Head Bob ─────────────────────────────────────────────

  _updateBob(dt) {
    if (this._isMoving && this.input.pointerLocked) {
      this._bobTimer += dt * BOB_FREQ;
    } else {
      // Retorno suave ao centro
      this._bobTimer += dt * BOB_FREQ;
      // quando parado, amortece o bob
    }
    this._bobActive = this._isMoving;
  }

  // ── Câmera ───────────────────────────────────────────────

  _updateCamera() {
    // Posição base: pés + altura dos olhos
    const eyePos = this.position.clone();
    eyePos.y = PLAYER_HEIGHT;

    // Aplica head-bob
    if (this._bobActive) {
      const amp = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight')
        ? BOB_AMP_Y * 1.5 : BOB_AMP_Y;
      eyePos.y += Math.sin(this._bobTimer * 2) * amp;
      eyePos.x += Math.sin(this._bobTimer)     * BOB_AMP_X;
    }

    this.camera.position.copy(eyePos);

    // Aplica rotação Euler (yaw primeiro, depois pitch)
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y     = this.yaw;
    this.camera.rotation.x     = this.pitch;
    this.camera.rotation.z     = 0;
  }

  // ── Dano e Vida ──────────────────────────────────────────

  /**
   * Aplica dano ao jogador.
   * @param {number} amount
   */
  takeDamage(amount) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.onHurt?.(amount);
    if (this.health <= 0) {
      this.alive = false;
      this.onDeath?.();
    }
  }

  /**
   * Cura o jogador.
   * @param {number} amount
   */
  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /** @returns {number} percentual de vida (0–1) */
  get healthPercent() {
    return this.health / this.maxHealth;
  }

  // ── Acessores ─────────────────────────────────────────────

  /** Posição dos olhos do jogador */
  get eyePosition() {
    return new THREE.Vector3(
      this.position.x,
      PLAYER_HEIGHT,
      this.position.z
    );
  }

  get radius()      { return PLAYER_RADIUS; }
  get playerHeight(){ return PLAYER_HEIGHT; }
}
