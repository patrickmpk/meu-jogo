/**
 * Enemy.js
 * Inimigo com IA básica: estados (IDLE, CHASE, ATTACK, DEAD),
 * pathfinding simples (steering), modelo 3D procedural e animações.
 * Atualizado: animação de morte melhorada, stats escalados por round.
 */

import * as THREE from 'three';

// ── Constantes base de comportamento ─────────────────────────────────────────
const BASE_DETECT_RANGE   = 22;
const BASE_ATTACK_RANGE   = 1.8;
const BASE_CHASE_SPEED    = 4.5;
const BASE_DAMAGE_PLAYER  = 10;
const ATTACK_COOLDOWN     = 1.2;
const BASE_MAX_HEALTH     = 60;
const WOBBLE_FREQ         = 4;

const ENEMY_RADIUS = 0.4;
const ENEMY_HEIGHT = 2.0;

// Estados
const STATE = { IDLE: 0, CHASE: 1, ATTACK: 2, DEAD: 3 };

let _enemyCount = 0;

export class Enemy {
  /**
   * @param {THREE.Scene}   scene
   * @param {THREE.Vector3} spawnPos
   * @param {number}        wave - número da onda atual (para escalonamento)
   */
  constructor(scene, spawnPos, wave = 1) {
    this.scene = scene;
    this.id    = _enemyCount++;
    this.wave  = wave;

    // ── Escalonamento por onda ─────────────────────────────
    // A cada onda: +8% velocidade, +12% vida, +5% dano
    const speedMult  = 1 + (wave - 1) * 0.08;
    const healthMult = 1 + (wave - 1) * 0.12;
    const damageMult = 1 + (wave - 1) * 0.05;

    this._chaseSpeed   = BASE_CHASE_SPEED  * speedMult;
    this._maxHealth    = Math.floor(BASE_MAX_HEALTH * healthMult);
    this._damagePlayer = Math.floor(BASE_DAMAGE_PLAYER * damageMult);
    this._attackRange  = BASE_ATTACK_RANGE;
    this._detectRange  = BASE_DETECT_RANGE;

    // Cor de dificuldade (fica mais vermelha/escura com ondas altas)
    const danger = Math.min(1, (wave - 1) / 10);
    this._bodyColor = new THREE.Color().setHSL(0.0, 0.8 + danger * 0.2, 0.35 - danger * 0.1);

    // ── Estado ─────────────────────────────────────────────
    this.state   = STATE.IDLE;
    this.health  = this._maxHealth;
    this.alive   = true;

    // ── Posição e movimento ────────────────────────────────
    this.position = spawnPos.clone();
    this._velocity = new THREE.Vector3();

    // ── Timers ─────────────────────────────────────────────
    this._attackCooldown = 0;
    this._walkTimer      = Math.random() * Math.PI * 2;
    this._deathTimer     = 0;
    this._deathDuration  = 0.55; // duração total da animação de morte
    this.removed         = false; // flag: grupo já foi removido da cena

    // ── Callbacks ──────────────────────────────────────────
    /** @type {Function|null} onAttack(damage) */
    this.onAttack = null;
    /** @type {Function|null} onDie(enemy) */
    this.onDie    = null;

    // ── 3D Model ───────────────────────────────────────────
    this._group = new THREE.Group();
    this._parts = {};
    this._buildModel();
    this.scene.add(this._group);
    this._group.position.copy(this.position);

    // ── Health bar ─────────────────────────────────────────
    this._buildHealthBar();
  }

  // ── Modelo 3D ─────────────────────────────────────────────

  _buildModel() {
    const col     = this._bodyColor;
    const darker  = col.clone().multiplyScalar(0.7);
    const matBody = new THREE.MeshLambertMaterial({ color: col });
    const matHead = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.04, 0.6, 0.55) });
    const matLimb = new THREE.MeshLambertMaterial({ color: darker });
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

    // Chifros (ondas altas ganham chifros)
    if (this.wave >= 5) {
      const hornMat = new THREE.MeshLambertMaterial({ color: 0x331100 });
      const hornGeo = new THREE.ConeGeometry(0.06, 0.22, 5);
      const hornL   = new THREE.Mesh(hornGeo, hornMat);
      hornL.position.set(-0.14, 2.06, 0);
      hornL.rotation.z = -0.3;
      const hornR = new THREE.Mesh(hornGeo, hornMat);
      hornR.position.set( 0.14, 2.06, 0);
      hornR.rotation.z =  0.3;
      this._group.add(hornL, hornR);
    }

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

    // Pivots de animação
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
    const bgGeo = new THREE.PlaneGeometry(0.8, 0.1);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x330000, depthTest: false });
    this._hpBg  = new THREE.Mesh(bgGeo, bgMat);

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

  update(dt, playerPos, camera, collision) {
    // Quando morto, a animação é controlada pelo EnemyManager via _updateDeath()
    if (!this.alive) return;

    const distSq = this.position.distanceToSquared(playerPos);
    const dist   = Math.sqrt(distSq);

    switch (this.state) {
      case STATE.IDLE:
        if (dist < this._detectRange) this.state = STATE.CHASE;
        break;

      case STATE.CHASE:
        this._chase(dt, playerPos, dist, collision);
        if (dist <= this._attackRange) this.state = STATE.ATTACK;
        break;

      case STATE.ATTACK:
        this._doAttack(dt);
        if (dist > this._attackRange * 1.5) this.state = STATE.CHASE;
        break;
    }

    this._group.position.copy(this.position);

    const lookTarget = playerPos.clone();
    lookTarget.y = this.position.y;
    this._group.lookAt(lookTarget);

    this._animateWalk(dt, this.state === STATE.CHASE || this.state === STATE.ATTACK);

    this._hpBar.quaternion.copy(camera.quaternion);
    this._updateHealthBar();
  }

  // ── Chase ──────────────────────────────────────────────────

  _chase(dt, playerPos, dist, collision) {
    const dir = playerPos.clone().sub(this.position).normalize();
    dir.y = 0;

    const newPos = this.position.clone().addScaledVector(dir, this._chaseSpeed * dt);
    newPos.y = 0;

    const push = collision.resolvePlayerCollision(newPos, ENEMY_RADIUS, ENEMY_HEIGHT);
    newPos.add(push);

    this.position.copy(newPos);
  }

  // ── Attack ─────────────────────────────────────────────────

  _doAttack(dt) {
    if (this._attackCooldown > 0) {
      this._attackCooldown -= dt;
      return;
    }
    this._attackCooldown = ATTACK_COOLDOWN;
    this.onAttack?.(this._damagePlayer);
  }

  // ── Animação de caminhada ──────────────────────────────────

  _animateWalk(dt, walking) {
    if (walking) {
      this._walkTimer += dt * WOBBLE_FREQ * (this._chaseSpeed / BASE_CHASE_SPEED);
      const swing = Math.sin(this._walkTimer) * 0.55;

      this._legLPivot.rotation.x =  swing;
      this._legRPivot.rotation.x = -swing;
      this._armLPivot.rotation.x = -swing * 0.7;
      this._armRPivot.rotation.x =  swing * 0.7;

      this._group.position.y = Math.abs(Math.sin(this._walkTimer * 2)) * 0.06;
    } else {
      this._walkTimer += dt * 1.5;
      this._armLPivot.rotation.z =  Math.sin(this._walkTimer) * 0.06 + 0.1;
      this._armRPivot.rotation.z = -Math.sin(this._walkTimer) * 0.06 - 0.1;
      this._legLPivot.rotation.x = 0;
      this._legRPivot.rotation.x = 0;
    }
  }

  // ── Dano e Morte ───────────────────────────────────────────

  takeDamage(damage) {
    if (!this.alive) return;
    this.health -= damage;
    this._flashDamage();

    if (this.health <= 0) {
      this.health = 0;
      this._die();
    }
  }

  _flashDamage() {
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
    this.alive   = false;
    this.removed = false;          // ainda não foi removido da cena
    this.state   = STATE.DEAD;
    this._deathTimer = this._deathDuration;
    this._hpBar.visible = false;

    // Dispara callback IMEDIATAMENTE ao morrer
    this.onDie?.(this);
  }

  // ── Animação de morte: cai rapidamente e desaparece ───────

  _updateDeath(dt) {
    // Já foi removido da cena — não faz nada
    if (this.removed) return;

    this._deathTimer -= dt;

    // progress vai de 0 (recém morreu) a 1 (fim da animação)
    const rawProgress = 1 - (this._deathTimer / this._deathDuration);
    const progress    = Math.min(1, Math.max(0, rawProgress));

    // Cai para frente
    this._group.rotation.x = progress * Math.PI * 0.55;

    // Afunda no chão
    this._group.position.y = -progress * 0.8;

    // Escala diminui na parte final (dissolve)
    if (progress > 0.55) {
      const fadeProgress = (progress - 0.55) / 0.45;
      const sc = Math.max(0, 1 - fadeProgress);
      this._group.scale.setScalar(sc);
    }

    // Flash vermelho logo no início
    if (progress < 0.15) {
      this._group.children.forEach(p => {
        if (p.material?.color) p.material.color.set(0xff4400);
      });
    }

    // Animação concluída — remove da cena uma única vez
    if (this._deathTimer <= 0) {
      this.scene.remove(this._group);
      this.removed = true;
    }
  }

  // ── Health Bar ──────────────────────────────────────────────

  _updateHealthBar() {
    const pct = Math.max(0, this.health / this._maxHealth);
    this._hpFg.scale.x = pct;
    this._hpFg.position.x = (pct - 1) * 0.4;

    const color = pct > 0.5 ? 0x22dd22 : pct > 0.25 ? 0xffaa00 : 0xff2222;
    this._hpFg.material.color.setHex(color);
  }

  // ── Dispose ─────────────────────────────────────────────────

  dispose() {
    if (!this.removed) {
      this.scene.remove(this._group);
      this.removed = true;
    }
  }

  get mesh()      { return this._group; }
  get maxHealth() { return this._maxHealth; }
  get radius()    { return ENEMY_RADIUS; }
}

export { STATE as ENEMY_STATE };
