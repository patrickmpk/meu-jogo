/**
 * Enemy.js
 * Inimigo com IA básica: estados (IDLE, CHASE, ATTACK, DEAD),
 * pathfinding simples (steering), modelo 3D procedural e animações.
 */

import * as THREE from 'three';

// ── Constantes de comportamento ──────────────────────────────────────────────
const DETECT_RANGE   = 22;    // distância de detecção do jogador
const ATTACK_RANGE   = 1.8;   // distância para atacar
const CHASE_SPEED    = 4.5;   // velocidade de perseguição
const DAMAGE_PLAYER  = 10;    // dano por ataque
const ATTACK_COOLDOWN = 1.2;  // seg entre ataques
const MAX_HEALTH      = 60;
const WOBBLE_FREQ     = 4;    // frequência da animação de caminhada

const ENEMY_RADIUS   = 0.4;
const ENEMY_HEIGHT   = 2.0;

// Estados
const STATE = { IDLE: 0, CHASE: 1, ATTACK: 2, DEAD: 3 };

let _enemyCount = 0;

export class Enemy {
  /**
   * @param {THREE.Scene}   scene
   * @param {THREE.Vector3} spawnPos
   */
  constructor(scene, spawnPos) {
    this.scene = scene;
    this.id    = _enemyCount++;

    // ── Estado ─────────────────────────────────────────────
    this.state   = STATE.IDLE;
    this.health  = MAX_HEALTH;
    this.alive   = true;

    // ── Posição e movimento ────────────────────────────────
    this.position = spawnPos.clone();
    this._velocity = new THREE.Vector3();

    // ── Timers ─────────────────────────────────────────────
    this._attackCooldown = 0;
    this._walkTimer      = Math.random() * Math.PI * 2; // fase aleatória
    this._deathTimer     = 0;

    // ── Callbacks ──────────────────────────────────────────
    /** @type {Function|null} onAttack(damage) */
    this.onAttack = null;
    /** @type {Function|null} onDie(enemy) */
    this.onDie    = null;

    // ── 3D Model ───────────────────────────────────────────
    this._group     = new THREE.Group();
    this._parts     = {};
    this._buildModel();
    this.scene.add(this._group);
    this._group.position.copy(this.position);

    // ── Health bar ─────────────────────────────────────────
    this._buildHealthBar();
  }

  // ── Modelo 3D ─────────────────────────────────────────────

  _buildModel() {
    const matBody = new THREE.MeshLambertMaterial({ color: 0x8B0000 });
    const matHead = new THREE.MeshLambertMaterial({ color: 0xcc6644 });
    const matLimb = new THREE.MeshLambertMaterial({ color: 0x7a0000 });
    const matEye  = new THREE.MeshBasicMaterial({ color: 0xff2200 });

    // Tronco
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.35), matBody);
    torso.position.y = 1.2;
    torso.castShadow = true;

    // Cabeça
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), matHead);
    head.position.y = 1.8;
    head.castShadow = true;

    // Olhos brilhantes
    const eyeGeo = new THREE.SphereGeometry(0.07, 6, 6);
    const eyeL = new THREE.Mesh(eyeGeo, matEye);
    eyeL.position.set(-0.12, 1.83, 0.2);
    const eyeR = new THREE.Mesh(eyeGeo, matEye);
    eyeR.position.set( 0.12, 1.83, 0.2);

    // Braços
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.58, 0.18), matLimb);
    armL.position.set(-0.4, 1.1, 0);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.58, 0.18), matLimb);
    armR.position.set( 0.4, 1.1, 0);

    // Pernas
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), matLimb);
    legL.position.set(-0.16, 0.4, 0);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), matLimb);
    legR.position.set( 0.16, 0.4, 0);

    this._parts = { torso, head, eyeL, eyeR, armL, armR, legL, legR };

    // Pivot de braço/perna para animação
    this._armLPivot = new THREE.Object3D();
    this._armLPivot.position.set(-0.4, 1.4, 0);
    this._armLPivot.add(armL);
    armL.position.set(0, -0.28, 0);

    this._armRPivot = new THREE.Object3D();
    this._armRPivot.position.set( 0.4, 1.4, 0);
    this._armRPivot.add(armR);
    armR.position.set(0, -0.28, 0);

    this._legLPivot = new THREE.Object3D();
    this._legLPivot.position.set(-0.16, 0.75, 0);
    this._legLPivot.add(legL);
    legL.position.set(0, -0.33, 0);

    this._legRPivot = new THREE.Object3D();
    this._legRPivot.position.set( 0.16, 0.75, 0);
    this._legRPivot.add(legR);
    legR.position.set(0, -0.33, 0);

    this._group.add(torso, head, eyeL, eyeR,
                    this._armLPivot, this._armRPivot,
                    this._legLPivot, this._legRPivot);
  }

  _buildHealthBar() {
    // Painel de fundo
    const bgGeo = new THREE.PlaneGeometry(0.8, 0.1);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x330000, depthTest: false });
    this._hpBg  = new THREE.Mesh(bgGeo, bgMat);

    // Barra de vida
    const fgGeo = new THREE.PlaneGeometry(0.8, 0.1);
    const fgMat = new THREE.MeshBasicMaterial({ color: 0x22dd22, depthTest: false });
    this._hpFg  = new THREE.Mesh(fgGeo, fgMat);
    this._hpFg.position.z = 0.001;

    const bar = new THREE.Group();
    bar.add(this._hpBg, this._hpFg);
    bar.position.y = 2.4;
    bar.renderOrder = 999;

    this._hpBar = bar;
    this._group.add(bar);
  }

  // ── Update ─────────────────────────────────────────────────

  /**
   * @param {number}          dt
   * @param {THREE.Vector3}   playerPos  - posição dos pés do jogador
   * @param {THREE.Camera}    camera     - para billboard da health bar
   * @param {import('../systems/CollisionSystem').CollisionSystem} collision
   */
  update(dt, playerPos, camera, collision) {
    if (!this.alive) {
      this._updateDeath(dt);
      return;
    }

    const distSq = this.position.distanceToSquared(playerPos);
    const dist   = Math.sqrt(distSq);

    // ── Máquina de estados ──────────────────────────────────
    switch (this.state) {
      case STATE.IDLE:
        if (dist < DETECT_RANGE) this.state = STATE.CHASE;
        break;

      case STATE.CHASE:
        this._chase(dt, playerPos, dist, collision);
        if (dist <= ATTACK_RANGE) this.state = STATE.ATTACK;
        break;

      case STATE.ATTACK:
        this._doAttack(dt);
        if (dist > ATTACK_RANGE * 1.5) this.state = STATE.CHASE;
        break;
    }

    // ── Atualiza mesh ───────────────────────────────────────
    this._group.position.copy(this.position);

    // Olha para o jogador
    const lookTarget = playerPos.clone();
    lookTarget.y = this.position.y;
    this._group.lookAt(lookTarget);

    // Animação de caminhada
    this._animateWalk(dt, this.state === STATE.CHASE || this.state === STATE.ATTACK);

    // Health bar: billboard (sempre vira pra câmera)
    this._hpBar.quaternion.copy(camera.quaternion);
    this._updateHealthBar();
  }

  // ── Chase ──────────────────────────────────────────────────

  _chase(dt, playerPos, dist, collision) {
    const dir = playerPos.clone().sub(this.position).normalize();
    dir.y = 0;

    const newPos = this.position.clone().addScaledVector(dir, CHASE_SPEED * dt);
    newPos.y = 0;

    // Verifica colisão com paredes
    const push = collision.resolvePlayerCollision(newPos, ENEMY_RADIUS, ENEMY_HEIGHT);
    newPos.add(push);

    // Separação entre inimigos (evitar sobreposição) — resolvido externamente
    this.position.copy(newPos);
  }

  // ── Attack ─────────────────────────────────────────────────

  _doAttack(dt) {
    if (this._attackCooldown > 0) {
      this._attackCooldown -= dt;
      return;
    }
    this._attackCooldown = ATTACK_COOLDOWN;
    this.onAttack?.(DAMAGE_PLAYER);
  }

  // ── Animação ───────────────────────────────────────────────

  _animateWalk(dt, walking) {
    if (walking) {
      this._walkTimer += dt * WOBBLE_FREQ;
      const swing = Math.sin(this._walkTimer) * 0.55;

      this._legLPivot.rotation.x =  swing;
      this._legRPivot.rotation.x = -swing;
      this._armLPivot.rotation.x = -swing * 0.7;
      this._armRPivot.rotation.x =  swing * 0.7;

      // Leve bobbing do corpo
      this._group.position.y = Math.abs(Math.sin(this._walkTimer * 2)) * 0.06;
    } else {
      // Idle: balanço suave
      this._walkTimer += dt * 1.5;
      this._armLPivot.rotation.z =  Math.sin(this._walkTimer) * 0.06 + 0.1;
      this._armRPivot.rotation.z = -Math.sin(this._walkTimer) * 0.06 - 0.1;
      this._legLPivot.rotation.x = 0;
      this._legRPivot.rotation.x = 0;
    }
  }

  // ── Dano e Morte ───────────────────────────────────────────

  /**
   * @param {number} damage
   */
  takeDamage(damage) {
    if (!this.alive) return;
    this.health -= damage;

    // Flash vermelho nos materiais
    this._flashDamage();

    if (this.health <= 0) {
      this.health = 0;
      this._die();
    }
  }

  _flashDamage() {
    // Troca temporariamente as cores dos materiais
    const parts = Object.values(this._parts);
    parts.forEach(p => {
      if (p.material?.color) {
        const orig = p.material.color.getHex();
        p.material.color.set(0xffffff);
        setTimeout(() => p.material?.color?.setHex(orig), 80);
      }
    });
  }

  _die() {
    this.alive = false;
    this.state = STATE.DEAD;
    this._deathTimer = 1.0;
    this.onDie?.(this);

    // Remove health bar
    this._hpBar.visible = false;
  }

  _updateDeath(dt) {
    this._deathTimer -= dt;

    // Cai gradualmente
    this._group.rotation.x += dt * 2.5;
    this._group.position.y -= dt * 1.5;

    if (this._deathTimer <= 0) {
      this.scene.remove(this._group);
    }
  }

  // ── Health Bar ──────────────────────────────────────────────

  _updateHealthBar() {
    const pct = Math.max(0, this.health / MAX_HEALTH);
    this._hpFg.scale.x = pct;
    this._hpFg.position.x = (pct - 1) * 0.4;

    // Cor por % de vida
    const color = pct > 0.5 ? 0x22dd22 : pct > 0.25 ? 0xffaa00 : 0xff2222;
    this._hpFg.material.color.setHex(color);
  }

  // ── Dispose ─────────────────────────────────────────────────

  dispose() {
    this.scene.remove(this._group);
  }

  /** Retorna mesh principal para raycasting de tiro */
  get mesh() { return this._group; }
  get maxHealth() { return MAX_HEALTH; }
  get radius()    { return ENEMY_RADIUS; }
}

export { STATE as ENEMY_STATE };
