/**
 * api.js
 * Cliente HTTP para a API do Shadow Strike.
 * Gerencia sessão do jogador no localStorage.
 */

const API_BASE = window.location.origin;

// ── Sessão local ──────────────────────────────────────────────────────────────
const SESSION_KEY = 'ss_player';

export const Session = {
  get()  { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } },
  set(p) { localStorage.setItem(SESSION_KEY, JSON.stringify(p)); },
  clear(){ localStorage.removeItem(SESSION_KEY); },
};

// ── Fetch wrapper ─────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const r = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

// ── API endpoints ─────────────────────────────────────────────────────────────
export const API = {

  /** Registra/recupera jogador */
  async register(nickname, wallet = null) {
    const data = await apiFetch('/api/players/register', {
      method: 'POST',
      body: JSON.stringify({ nickname, wallet }),
    });
    Session.set(data.player);
    return data;
  },

  /** Perfil completo */
  async getProfile(id) {
    return apiFetch(`/api/players/${id}`);
  },

  /** Ranking mensal */
  async getLeaderboard(month = null, limit = 100) {
    const q = new URLSearchParams();
    if (month) q.set('month', month);
    q.set('limit', limit);
    return apiFetch(`/api/leaderboard?${q}`);
  },

  /** Submete score ao final da partida */
  async submitScore({ score, kills, waveReached, durationSec }) {
    const player = Session.get();
    if (!player) throw new Error('Sem sessão ativa.');
    return apiFetch('/api/scores/submit', {
      method: 'POST',
      body: JSON.stringify({
        playerId: player.id,
        score, kills, waveReached, durationSec,
      }),
    });
  },

  /** Tabela de tiers de recompensa */
  async getRewardTable() {
    return apiFetch('/api/rewards/table');
  },

  /** Reivindica recompensa diária */
  async claimReward() {
    const player = Session.get();
    if (!player) throw new Error('Sem sessão ativa.');
    return apiFetch('/api/rewards/claim', {
      method: 'POST',
      body: JSON.stringify({ playerId: player.id }),
    });
  },

  /** Histórico de recompensas */
  async getRewardHistory(playerId) {
    return apiFetch(`/api/rewards/history/${playerId}`);
  },

  /** Estatísticas globais */
  async getStats() {
    return apiFetch('/api/stats');
  },
};
