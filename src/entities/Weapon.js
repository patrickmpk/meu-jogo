/**
 * Weapon.js
 * Sistema de arma do jogador: modelo 3D procedural, animação de tiro
 * e recuo, raycasting de hitscan e sistema de munição/recarga.
 */

import * as THREE from 'three';

const MAG_SIZE      = 30;
const RESERVE_MAX   = 120;
const RELOAD_TIME   = 1.8;   // segundos
const FIRE_RATE     = 0.1;   // mínimo entre tiros (seg)
const DAMAGE        = 25;

// Recuo (kick-back) da câmera
const RECOIL_PITCH  = 0.022;
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

    // ── Munição ────────────────────────────────────────────
    this.magAmmo     = MAG_SIZE;
    this.reserveAmmo = RESERVE_MAX;
    this.isReloading = false;
    this._reloadTimer = 0;
    this._fireCooldown = 0;

    // ── Estado de animação ─────────────────────────────────
    this._recoilPitch = 0;    // pitch atual de recuo
    this._swayX       = 0;
    this._swayY       = 0;
    this._muzzleTimer = 0;

    // ── Callbacks ──────────────────────────────────────────
    /** @type {Function|null} onHit(object3D, point, damage) */
    this.onHit    = null;
    /** @type {Function|null} onAmmoChange(mag, reserve) */
    this.onAmmoChange = null;

    // ── Constrói modelo 3D ─────────────────────────────────
    this._group = new THREE.Group();
    this._buildModel();
    scene.add(this._group);

    // ── Pool de partículas de impacto ─────────────────────
    this._decals = [];

    // ── Inimigos rastreados (definido externamente) ────────
    /** @type {THREE.Object3D[]} meshes alvejáveis */
    this.targets = [];
  }

  // ── Construção do modelo 3D ──────────────────────────────

  _buildModel() {
    const mat = {
      dark:   new THREE.MeshLambertMaterial({ color: 0x222222 }),
      metal:  new THREE.MeshLambertMaterial({ color: 0x555566 }),
      grip:   new THREE.MeshLambertMaterial({ color: 0x3a2a1a }),
      muzzle: new THREE.MeshLambertMaterial({ color: 0x888888 }),
      flash:  new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true, opacity: 0 }),
    };

    // Corpo principal
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.35), mat.dark);
    body.position.set(0, 0, -0.1);

    // Cano
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.32, 8), mat.metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.3);

    // Punho
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, 0.07), mat.grip);
    grip.position.set(0, -0.07, -0.06);
    grip.rotation.x = 0.25;

    // Pente
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.05), mat.dark);
    mag.position.set(0, -0.09, -0.1);

    // Mira traseira
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.01), mat.metal);
    sight.position.set(0, 0.05, -0.01);

    // Boca do cano (flash)
    const flashGeo = new THREE.SphereGeometry(0.04, 8, 8);
    this._flashMesh = new THREE.Mesh(flashGeo, mat.flash);
    this._flashMesh.position.set(0, 0.01, -0.46);

    this._group.add(body, barrel, grip, mag, sight, this._flashMesh);
  }

  // ── Update ────────────────────────────────────────────────

  /**
   * @param {number} dt
   * @param {THREE.Vector3} cameraPos
   * @param {number}        yaw
   * @param {number}        pitch
   * @param {boolean}       isMoving
   */
  update(dt, cameraPos, yaw, pitch, isMoving) {
    // Cooldowns
    if (this._fireCooldown > 0) this._fireCooldown -= dt;

    // Recarga
    if (this.isReloading) {
      this._reloadTimer -= dt;
      if (this._reloadTimer <= 0) {
        this._finishReload();
      }
    }

    // Flash do cano
    if (this._muzzleTimer > 0) {
      this._muzzleTimer -= dt;
      const t = this._muzzleTimer / 0.06;
      this._flashMesh.material.opacity = t * 0.9;
      this._flashMesh.scale.setScalar(1 + (1 - t) * 0.5);
    } else {
      this._flashMesh.material.opacity = 0;
    }

    // Recuo retorna suavemente
    this._recoilPitch *= (1 - Math.min(1, RECOIL_RETURN * dt * 60));

    // Sway (balanço leve da arma)
    const targetSwayX = isMoving ? Math.sin(Date.now() * 0.006) * 0.012 : 0;
    const targetSwayY = isMoving ? Math.cos(Date.now() * 0.003) * 0.006 : 0;
    this._swayX += (targetSwayX - this._swayX) * 8 * dt;
    this._swayY += (targetSwayY - this._swayY) * 8 * dt;

    // Posiciona o grupo da arma na cena, alinhado com a câmera
    this._positionWeapon(cameraPos, yaw, pitch);
  }

  _positionWeapon(camPos, yaw, pitch) {
    // Posição: canto inferior direito da visão
    const offsetX =  0.22;
    const offsetY = -0.22 + this._swayY;
    const offsetZ = -0.35;

    // Cria quaternion de rotação da câmera
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler(
      pitch + this._recoilPitch,
      yaw,
      0,
      'YXZ'
    );
    q.setFromEuler(euler);

    // Calcula posição local e aplica rotação da câmera
    const localOffset = new THREE.Vector3(
      offsetX + this._swayX,
      offsetY,
      offsetZ
    );
    localOffset.applyQuaternion(q);

    this._group.position.copy(camPos).add(localOffset);
    this._group.quaternion.copy(q);
  }

  // ── Disparo ───────────────────────────────────────────────

  /**
   * Tenta disparar a arma. Retorna true se atirou.
   * @returns {boolean}
   */
  shoot() {
    if (this.isReloading)          return false;
    if (this._fireCooldown > 0)    return false;
    if (this.magAmmo <= 0) {
      this.audio.playEmpty();
      // Recarga automática se houver reserva
      if (this.reserveAmmo > 0) this.startReload();
      return false;
    }

    // Consome munição
    this.magAmmo--;
    this._fireCooldown = FIRE_RATE;
    this.onAmmoChange?.(this.magAmmo, this.reserveAmmo);

    // Som
    this.audio.playShoot();

    // Flash do cano
    this._muzzleTimer = 0.06;

    // Animação de recuo
    this._recoilPitch -= RECOIL_PITCH;

    // Hitscan (raycasting do centro da câmera)
    this._doRaycast();

    return true;
  }

  _doRaycast() {
    const hit = this.collision.raycastFromCamera(this.camera, this.targets, 80);
    if (!hit) return;

    // Efeito de impacto (decal ponto)
    this._spawnImpactDecal(hit.point);

    // Notifica hit com dano
    this.onHit?.(hit.object, hit.point, DAMAGE);
  }

  /** Cria marcas de impacto (pequenas esferas) */
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

    // Remove após 3 segundos
    setTimeout(() => {
      this.scene.remove(mesh);
      geo.dispose();
    }, 3000);
  }

  // ── Recarga ───────────────────────────────────────────────

  startReload() {
    if (this.isReloading)         return;
    if (this.magAmmo === MAG_SIZE) return;
    if (this.reserveAmmo <= 0)    return;

    this.isReloading  = true;
    this._reloadTimer = RELOAD_TIME;
    this.audio.playReload();
  }

  _finishReload() {
    const needed  = MAG_SIZE - this.magAmmo;
    const toLoad  = Math.min(needed, this.reserveAmmo);
    this.magAmmo     += toLoad;
    this.reserveAmmo -= toLoad;
    this.isReloading  = false;
    this.onAmmoChange?.(this.magAmmo, this.reserveAmmo);
  }

  /** Progresso de recarga (0–1) para a barra no HUD */
  get reloadProgress() {
    if (!this.isReloading) return 1;
    return 1 - (this._reloadTimer / RELOAD_TIME);
  }

  /** @returns {{ mag: number, reserve: number, maxMag: number }} */
  get ammoInfo() {
    return { mag: this.magAmmo, reserve: this.reserveAmmo, maxMag: MAG_SIZE };
  }

  /** Adiciona munição à reserva (power-up futuro) */
  addAmmo(amount) {
    this.reserveAmmo = Math.min(RESERVE_MAX, this.reserveAmmo + amount);
    this.onAmmoChange?.(this.magAmmo, this.reserveAmmo);
  }
}
