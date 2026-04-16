/**
 * CollisionSystem.js
 * Sistema de colisão AABB (Axis-Aligned Bounding Box).
 * Resolve colisões do jogador com paredes/obstáculos e
 * provê raycasting para detecção de hit de projéteis.
 */

import * as THREE from 'three';

export class CollisionSystem {
  /**
   * @param {{ min: THREE.Vector3, max: THREE.Vector3 }[]} staticColliders
   */
  constructor(staticColliders = []) {
    /** Colliders estáticos do nível */
    this.staticColliders = staticColliders;

    // Reutilização de objetos (evita GC pressure)
    this._v = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
  }

  // ── AABB helpers ─────────────────────────────────────────

  /**
   * Verifica se uma AABB do jogador (capsule simplificada como caixa)
   * penetra algum collider estático e retorna vetor de correção.
   *
   * @param {THREE.Vector3} position  - posição atual do jogador
   * @param {number}        radius    - raio da cápsula horizontal
   * @param {number}        height    - altura da cápsula
   * @returns {THREE.Vector3}         - vetor de empurrão (pode ser zero)
   */
  resolvePlayerCollision(position, radius, height) {
    const push = new THREE.Vector3();

    const pMin = new THREE.Vector3(
      position.x - radius, position.y,          position.z - radius
    );
    const pMax = new THREE.Vector3(
      position.x + radius, position.y + height, position.z + radius
    );

    for (const col of this.staticColliders) {
      if (!this._aabbOverlap(pMin, pMax, col.min, col.max)) continue;

      // Calcula penetração em cada eixo
      const ox = Math.min(pMax.x - col.min.x, col.max.x - pMin.x);
      const oz = Math.min(pMax.z - col.min.z, col.max.z - pMin.z);

      // Empurra pelo eixo de menor penetração (resolve sliding)
      if (ox < oz) {
        push.x += (pMax.x - col.min.x < col.max.x - pMin.x) ? -ox : ox;
      } else {
        push.z += (pMax.z - col.min.z < col.max.z - pMin.z) ? -oz : oz;
      }
    }

    return push;
  }

  /**
   * Verifica sobreposição de dois AABBs.
   */
  _aabbOverlap(aMin, aMax, bMin, bMax) {
    return (
      aMax.x > bMin.x && aMin.x < bMax.x &&
      aMax.y > bMin.y && aMin.y < bMax.y &&
      aMax.z > bMin.z && aMin.z < bMax.z
    );
  }

  /**
   * Verifica se um ponto está dentro de algum collider estático.
   * Útil para detectar se inimigo está preso.
   */
  pointInCollider(point) {
    for (const col of this.staticColliders) {
      if (
        point.x > col.min.x && point.x < col.max.x &&
        point.y > col.min.y && point.y < col.max.y &&
        point.z > col.min.z && point.z < col.max.z
      ) return true;
    }
    return false;
  }

  // ── Raycasting para tiro ─────────────────────────────────

  /**
   * Lança um raio da câmera para o centro da tela e verifica hit.
   * Retorna o objeto mais próximo atingido ou null.
   *
   * @param {THREE.Camera}   camera
   * @param {THREE.Object3D[]} targets - meshes dos inimigos
   * @param {number}         maxDist
   * @returns {{ object: THREE.Object3D, distance: number, point: THREE.Vector3 }|null}
   */
  raycastFromCamera(camera, targets, maxDist = 80, spread = 0) {
    // Direção para o centro da tela com spread opcional (para escopeta)
    const sx = spread > 0 ? (Math.random() - 0.5) * spread * 2 : 0;
    const sy = spread > 0 ? (Math.random() - 0.5) * spread * 2 : 0;
    this._raycaster.setFromCamera({ x: sx, y: sy }, camera);
    this._raycaster.far = maxDist;

    const hits = this._raycaster.intersectObjects(targets, true);
    if (hits.length === 0) return null;

    return {
      object:   hits[0].object,
      distance: hits[0].distance,
      point:    hits[0].point.clone(),
    };
  }

  /**
   * Verifica se o raio da câmera colide com a geometria estática
   * antes de atingir a distância alvo (para checar line-of-sight).
   *
   * @param {THREE.Camera}   camera
   * @param {THREE.Object3D[]} wallMeshes
   * @param {number}         targetDist
   * @returns {boolean}
   */
  hasLineOfSight(from, to, wallMeshes) {
    const dir = to.clone().sub(from).normalize();
    const dist = from.distanceTo(to);
    this._raycaster.set(from, dir);
    this._raycaster.far = dist;
    const hits = this._raycaster.intersectObjects(wallMeshes, false);
    return hits.length === 0;
  }

  /**
   * Verifica colisão entre ponto e esfera (para dano de inimigo no jogador)
   */
  spherePoint(center, radius, point) {
    return center.distanceToSquared(point) <= radius * radius;
  }

  /**
   * Verifica colisão esfera-esfera
   */
  sphereSphere(c1, r1, c2, r2) {
    const minDist = r1 + r2;
    return c1.distanceToSquared(c2) <= minDist * minDist;
  }
}
