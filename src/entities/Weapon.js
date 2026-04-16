/**
 * Weapon.js
 * Sistema de arma do jogador: modelo 3D procedural, animação de tiro
 * e recuo, raycasting de hitscan e sistema de munição/recarga.
 * Atualizado: suporte a múltiplas armas, pellets (escopeta), escalonamento por round.
 */

import * as THREE from 'three';
import { getAvailableWeapons, getWeaponById } from './WeaponSystem.js';

// Recuo (kick-back) da câmera
const RECOIL_RETURN = 0.12;

export class Weapon {
  /**
   * @param {THREE.Camera}  camera
   * @param {THREE.Scene}   scene
   * @param {import('../systems/CollisionSystem').CollisionSystem} collision
   * @param {import('../audio/AudioManager').AudioManager}         audio
   */
  constructor(camera, scene, collision, audio) {
    this.camera    = camera;
    this.scene     = scene;
    this.collision = collision;
    this.audio     = audio;

    // ── Arma atual ─────────────────────────────────────────
    this._currentWeaponId = 'ar';
    this._weaponConfig    = getWeaponById('ar');

    this.magAmmo     = this._weaponConfig.magSize;
    this.reserveAmmo = this._weaponConfig.reserveMax;
    this.isReloading  = false;
    this._reloadTimer  = 0;
    this._fireCooldown = 0;

    // ── Estado de animação ─────────────────────────────────
    this._recoilPitch = 0;
    this._swayX       = 0;
    this._swayY       = 0;
    this._muzzleTimer = 0;

    // ── Round atual (para determinar armas disponíveis) ────
    this._currentRound = 1;

    // ── Callbacks ──────────────────────────────────────────
    /** @type {Function|null} onHit(object3D, point, damage) */
    this.onHit = null;
    /** @type {Function|null} onAmmoChange(mag, reserve) */
    this.onAmmoChange = null;
    /** @type {Function|null} onWeaponChange(config) */
    this.onWeaponChange = null;

    // ── Constrói modelo 3D ─────────────────────────────────
    this._group = new THREE.Group();
    this._buildModel();
    scene.add(this._group);

    // ── Pool de partículas de impacto ─────────────────────
    this._decals = [];

    // ── Inimigos rastreados ────────────────────────────────
    /** @type {THREE.Object3D[]} */
    this.targets = [];

    // ── HUD de seleção de arma ────────────────────────────
    this._buildWeaponHUD();
  }

  // ── Constrói HUD de armas ────────────────────────────────

  _buildWeaponHUD() {
    // Remove HUD existente se houver
    const existing = document.getElementById('weaponSelectHUD');
    if (existing) existing.remove();

    const hud = document.createElement('div');
    hud.id = 'weaponSelectHUD';
    hud.style.cssText = `
      position: fixed;
      bottom: 90px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 8px;
      z-index: 100;
      pointer-events: none;
    `;
    document.body.appendChild(hud);
    this._weaponHUD = hud;
    this._refreshWeaponHUD();
  }

  _refreshWeaponHUD() {
    if (!this._weaponHUD) return;
    const available = getAvailableWeapons(this._currentRound);

    this._weaponHUD.innerHTML = available.map((w, i) => {
      const active = w.id === this._currentWeaponId;
      return `
        <div style="
          background: ${active ? 'rgba(232,65,59,0.85)' : 'rgba(0,0,0,0.6)'};
          border: 1px solid ${active ? '#e8413b' : 'rgba(255,255,255,0.25)'};
          border-radius: 6px;
          padding: 4px 10px;
          font-family: monospace;
          font-size: 0.72rem;
          color: #fff;
          letter-spacing: .04em;
          min-width: 60px;
          text-align: center;
        ">
          <div style="font-weight:700;font-size:.65rem;color:${active?'#fff':'#aaa'}">[${i + 1}]</div>
          <div>${w.name}</div>
        </div>
      `;
    }).join('');
  }

  // ── Construção do modelo 3D ──────────────────────────────

  _buildModel() {
    // Limpa o grupo
    while (this._group.children.length) this._group.remove(this._group.children[0]);

    const cfg = this._weaponConfig;
    const col = cfg.color || 0x222222;

    const mat = {
      dark:   new THREE.MeshLambertMaterial({ color: col }),
      metal:  new THREE.MeshLambertMaterial({ color: 0x555566 }),
      grip:   new THREE.MeshLambertMaterial({ color: 0x3a2a1a }),
      muzzle: new THREE.MeshLambertMaterial({ color: 0x888888 }),
      flash:  new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true, opacity: 0 }),
    };

    // Geometria varia conforme tipo de arma
    let bodyW = 0.08, bodyH = 0.08, bodyD = 0.35;
    let barrelLen = 0.32;

    if (cfg.id === 'shotgun') { bodyW = 0.10; bodyH = 0.10; bodyD = 0.45; barrelLen = 0.42; }
    else if (cfg.id === 'sniper') { bodyW = 0.07; bodyH = 0.07; bodyD = 0.60; barrelLen = 0.55; }
    else if (cfg.id === 'lmg')    { bodyW = 0.12; bodyH = 0.12; bodyD = 0.50; barrelLen = 0.45; }
    else if (cfg.id === 'rl')     { bodyW = 0.14; bodyH = 0.14; bodyD = 0.65; barrelLen = 0.50; }
    else if (cfg.id === 'smg')    { bodyW = 0.07; bodyH = 0.08; bodyD = 0.28; barrelLen = 0.25; }
    else if (cfg.id === 'pistol') { bodyW = 0.06; bodyH = 0.09; bodyD = 0.22; barrelLen = 0.20; }

    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), mat.dark);
    body.position.set(0, 0, -bodyD * 0.3);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, barrelLen, 8), mat.metal
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -(bodyD * 0.3 + barrelLen * 0.5));

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, 0.07), mat.grip);
    grip.position.set(0, -0.07, -0.06);
    grip.rotation.x = 0.25;

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.05), mat.dark);
    mag.position.set(0, -0.09, -bodyD * 0.28);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.01), mat.metal);
    sight.position.set(0, bodyH * 0.7, -bodyD * 0.28);

    const flashGeo = new THREE.SphereGeometry(cfg.id === 'shotgun' ? 0.06 : 0.04, 8, 8);
    this._flashMesh = new THREE.Mesh(flashGeo, mat.flash);
    this._flashMesh.position.set(0, 0.01, -(bodyD * 0.3 + barrelLen + 0.04));

    this._group.add(body, barrel, grip, mag, sight, this._flashMesh);
  }

  // ── Update ────────────────────────────────────────────────

  update(dt, cameraPos, yaw, pitch, isMoving) {
    if (this._fireCooldown > 0) this._fireCooldown -= dt;

    if (this.isReloading) {
      this._reloadTimer -= dt;
      if (this._reloadTimer <= 0) this._finishReload();
    }

    if (this._muzzleTimer > 0) {
      this._muzzleTimer -= dt;
      const t = this._muzzleTimer / 0.06;
      this._flashMesh.material.opacity = t * 0.9;
      this._flashMesh.scale.setScalar(1 + (1 - t) * 0.5);
    } else {
      this._flashMesh.material.opacity = 0;
    }

    this._recoilPitch *= (1 - Math.min(1, RECOIL_RETURN * dt * 60));

    const targetSwayX = isMoving ? Math.sin(Date.now() * 0.006) * 0.012 : 0;
    const targetSwayY = isMoving ? Math.cos(Date.now() * 0.003) * 0.006 : 0;
    this._swayX += (targetSwayX - this._swayX) * 8 * dt;
    this._swayY += (targetSwayY - this._swayY) * 8 * dt;

    this._positionWeapon(cameraPos, yaw, pitch);
  }

  _positionWeapon(camPos, yaw, pitch) {
    const offsetX =  0.22;
    const offsetY = -0.22 + this._swayY;
    const offsetZ = -0.35;

    const q = new THREE.Quaternion();
    const euler = new THREE.Euler(pitch + this._recoilPitch, yaw, 0, 'YXZ');
    q.setFromEuler(euler);

    const localOffset = new THREE.Vector3(offsetX + this._swayX, offsetY, offsetZ);
    localOffset.applyQuaternion(q);

    this._group.position.copy(camPos).add(localOffset);
    this._group.quaternion.copy(q);
  }

  // ── Disparo ───────────────────────────────────────────────

  shoot() {
    if (this.isReloading)       return false;
    if (this._fireCooldown > 0) return false;
    if (this.magAmmo <= 0) {
      this.audio.playEmpty();
      if (this.reserveAmmo > 0) this.startReload();
      return false;
    }

    this.magAmmo--;
    this._fireCooldown = this._weaponConfig.fireRate;
    this.onAmmoChange?.(this.magAmmo, this.reserveAmmo);

    this.audio.playShoot();
    this._muzzleTimer = 0.06;
    this._recoilPitch -= this._weaponConfig.recoil;

    // Escopeta: múltiplos pellets
    if (this._weaponConfig.pellets && this._weaponConfig.pellets > 1) {
      for (let p = 0; p < this._weaponConfig.pellets; p++) {
        this._doRaycast(this._weaponConfig.spread || 0.04);
      }
    } else {
      this._doRaycast(0);
    }

    return true;
  }

  _doRaycast(spread = 0) {
    const hit = this.collision.raycastFromCamera(this.camera, this.targets, 80, spread);
    if (!hit) return;

    this._spawnImpactDecal(hit.point);
    this.onHit?.(hit.object, hit.point, this._weaponConfig.damage);
  }

  _spawnImpactDecal(point) {
    if (this._decals.length > 30) {
      const old = this._decals.shift();
      this.scene.remove(old);
      old.geometry.dispose();
    }
    const geo  = new THREE.SphereGeometry(0.04, 4, 4);
    const mat  = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(point);
    this.scene.add(mesh);
    this._decals.push(mesh);

    setTimeout(() => {
      this.scene.remove(mesh);
      geo.dispose();
    }, 3000);
  }

  // ── Recarga ───────────────────────────────────────────────

  startReload() {
    if (this.isReloading)                               return;
    if (this.magAmmo === this._weaponConfig.magSize)    return;
    if (this.reserveAmmo <= 0)                          return;

    this.isReloading  = true;
    this._reloadTimer = this._weaponConfig.reloadTime;
    this.audio.playReload();
  }

  _finishReload() {
    const needed  = this._weaponConfig.magSize - this.magAmmo;
    const toLoad  = Math.min(needed, this.reserveAmmo);
    this.magAmmo     += toLoad;
    this.reserveAmmo -= toLoad;
    this.isReloading  = false;
    this.onAmmoChange?.(this.magAmmo, this.reserveAmmo);
  }

  // ── Troca de arma ─────────────────────────────────────────

  /**
   * Equipa uma arma pelo ID.
   * @param {string} weaponId
   * @param {boolean} keepAmmo - mantém a munição atual (false = usa config padrão)
   */
  equipWeapon(weaponId, keepAmmo = false) {
    const cfg = getWeaponById(weaponId);
    if (!cfg) return;

    this._currentWeaponId = weaponId;
    this._weaponConfig    = cfg;

    if (!keepAmmo) {
      this.magAmmo     = cfg.magSize;
      this.reserveAmmo = cfg.reserveMax;
    }

    this.isReloading  = false;
    this._reloadTimer = 0;
    this._fireCooldown = 0;
    this._recoilPitch  = 0;

    this._buildModel();
    this.onAmmoChange?.(this.magAmmo, this.reserveAmmo);
    this.onWeaponChange?.(cfg);
    this._refreshWeaponHUD();
  }

  /**
   * Seleciona arma pelo índice (teclas 1-7).
   * @param {number} index - 0-based
   */
  selectWeaponByIndex(index) {
    const available = getAvailableWeapons(this._currentRound);
    if (index >= 0 && index < available.length) {
      this.equipWeapon(available[index].id, false);
    }
  }

  /**
   * Atualiza o round atual — desbloqueia novas armas.
   * @param {number} round
   */
  setRound(round) {
    this._currentRound = round;
    this._refreshWeaponHUD();

    // Aumenta a reserva máxima da arma atual com o round
    const bonusAmmo = (round - 1) * 20;
    const cfg = this._weaponConfig;
    this.reserveAmmo = Math.min(
      cfg.reserveMax + bonusAmmo,
      this.reserveAmmo + bonusAmmo
    );
    this.onAmmoChange?.(this.magAmmo, this.reserveAmmo);
  }

  /** Adiciona munição à reserva */
  addAmmo(amount) {
    const maxReserve = this._weaponConfig.reserveMax + (this._currentRound - 1) * 20;
    this.reserveAmmo = Math.min(maxReserve, this.reserveAmmo + amount);
    this.onAmmoChange?.(this.magAmmo, this.reserveAmmo);
  }

  get reloadProgress() {
    if (!this.isReloading) return 1;
    return 1 - (this._reloadTimer / this._weaponConfig.reloadTime);
  }

  get ammoInfo() {
    return {
      mag:     this.magAmmo,
      reserve: this.reserveAmmo,
      maxMag:  this._weaponConfig.magSize,
    };
  }

  get weaponName() { return this._weaponConfig.name; }
}
