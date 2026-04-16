/**
 * main.js
 * Ponto de entrada do jogo.
 * Instancia o Game e configura handlers globais.
 */

import { Game } from './Game.js';

// ── Instância global do jogo ──────────────────────────────────────────────────
let game;

// Aguarda o DOM estar pronto
window.addEventListener('DOMContentLoaded', () => {
  // Cria o jogo (inicia o loop de renderização imediatamente)
  game = new Game();

  // ── Clique no canvas → reaquire pointer lock quando pausado ──────────────
  const canvas = document.getElementById('gameCanvas');
  canvas.addEventListener('click', () => {
    game.handleCanvasClick();
  });

  // ── Previne menu de contexto (botão direito) durante o jogo ──────────────
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ── Prevenção de duplo-clique selecionando texto ──────────────────────────
  document.addEventListener('selectstart', (e) => e.preventDefault());

  console.log('%c🔫 Shadow Strike FPS — Carregado!', 'color:#e8413b;font-size:1.2em;font-weight:bold');
  console.log('%cControles: WASD = mover | Mouse = mirar | LMB = atirar | R = recarregar | Shift = correr | ESC = pausar',
    'color:#aaa');
});
