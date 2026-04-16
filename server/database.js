/**
 * database.js
 * Inicializa e gerencia o banco SQLite do jogo.
 * Tabelas: players, monthly_scores, daily_rewards, airdrop_points, reward_history
 */

const Database = require('better-sqlite3');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '../data/game.db');

// Garante que o diretório existe
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// ── Otimizações de performance ────────────────────────────────────────────────
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// ── Criação das tabelas ───────────────────────────────────────────────────────
db.exec(`
  -- Jogadores registrados
  CREATE TABLE IF NOT EXISTS players (
    id            TEXT PRIMARY KEY,          -- UUID
    nickname      TEXT NOT NULL UNIQUE,
    wallet        TEXT DEFAULT NULL,         -- endereço cripto (opcional, futuro airdrop)
    created_at    INTEGER NOT NULL,          -- unix timestamp
    last_seen     INTEGER NOT NULL,
    total_games   INTEGER DEFAULT 0,
    total_kills   INTEGER DEFAULT 0,
    best_score    INTEGER DEFAULT 0
  );

  -- Partidas (cada score submetido)
  CREATE TABLE IF NOT EXISTS game_sessions (
    id            TEXT PRIMARY KEY,
    player_id     TEXT NOT NULL REFERENCES players(id),
    score         INTEGER NOT NULL,
    kills         INTEGER NOT NULL DEFAULT 0,
    wave_reached  INTEGER NOT NULL DEFAULT 1,
    duration_sec  INTEGER NOT NULL DEFAULT 0,
    played_at     INTEGER NOT NULL,          -- unix timestamp
    month_key     TEXT NOT NULL             -- formato "YYYY-MM"
  );

  -- Score mensal acumulado por jogador (soma das top-5 partidas do mês)
  CREATE TABLE IF NOT EXISTS monthly_scores (
    id            TEXT PRIMARY KEY,
    player_id     TEXT NOT NULL REFERENCES players(id),
    month_key     TEXT NOT NULL,             -- "YYYY-MM"
    total_score   INTEGER NOT NULL DEFAULT 0,
    games_played  INTEGER NOT NULL DEFAULT 0,
    best_score    INTEGER NOT NULL DEFAULT 0,
    total_kills   INTEGER NOT NULL DEFAULT 0,
    rank_position INTEGER DEFAULT NULL,      -- calculado no fechamento
    updated_at    INTEGER NOT NULL,
    UNIQUE(player_id, month_key)
  );

  -- Saldo de Airdrop-Points por jogador
  CREATE TABLE IF NOT EXISTS airdrop_points (
    player_id     TEXT PRIMARY KEY REFERENCES players(id),
    balance       REAL NOT NULL DEFAULT 0,   -- saldo atual
    total_earned  REAL NOT NULL DEFAULT 0,   -- histórico total
    total_spent   REAL NOT NULL DEFAULT 0,
    last_reward   INTEGER DEFAULT NULL       -- timestamp da última recompensa
  );

  -- Histórico de recompensas diárias distribuídas
  CREATE TABLE IF NOT EXISTS reward_history (
    id            TEXT PRIMARY KEY,
    player_id     TEXT NOT NULL REFERENCES players(id),
    month_key     TEXT NOT NULL,
    reward_date   TEXT NOT NULL,             -- "YYYY-MM-DD"
    rank_position INTEGER NOT NULL,
    rank_tier     TEXT NOT NULL,             -- "top1","top3","top10","top25","top50","top100"
    points_awarded REAL NOT NULL,
    score_snapshot INTEGER NOT NULL,         -- score no momento da recompensa
    created_at    INTEGER NOT NULL
  );

  -- Índices para queries frequentes
  CREATE INDEX IF NOT EXISTS idx_sessions_player_month ON game_sessions(player_id, month_key);
  CREATE INDEX IF NOT EXISTS idx_sessions_month        ON game_sessions(month_key);
  CREATE INDEX IF NOT EXISTS idx_monthly_month         ON monthly_scores(month_key, total_score DESC);
  CREATE INDEX IF NOT EXISTS idx_rewards_player        ON reward_history(player_id, reward_date);
`);

// ── Helpers de data ───────────────────────────────────────────────────────────

function now()        { return Math.floor(Date.now() / 1000); }
function monthKey()   { return new Date().toISOString().slice(0, 7); }       // "YYYY-MM"
function dateKey()    { return new Date().toISOString().slice(0, 10); }      // "YYYY-MM-DD"
function monthKeyOf(ts) { return new Date(ts * 1000).toISOString().slice(0, 7); }

// ── API do banco ──────────────────────────────────────────────────────────────

const DB = {

  // ── Players ──────────────────────────────────────────────

  /**
   * Cria ou retorna um jogador pelo nickname.
   * @returns {object} player row
   */
  upsertPlayer(nickname, wallet = null) {
    nickname = nickname.trim().slice(0, 24);

    let player = db.prepare('SELECT * FROM players WHERE nickname = ?').get(nickname);

    if (!player) {
      const id = uuidv4();
      const ts = now();
      db.prepare(`
        INSERT INTO players (id, nickname, wallet, created_at, last_seen)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, nickname, wallet, ts, ts);

      db.prepare(`
        INSERT INTO airdrop_points (player_id, balance, total_earned, total_spent)
        VALUES (?, 0, 0, 0)
      `).run(id);

      player = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
    } else {
      // Atualiza last_seen e wallet se fornecida
      db.prepare(`
        UPDATE players SET last_seen = ?, wallet = COALESCE(?, wallet) WHERE id = ?
      `).run(now(), wallet, player.id);
    }

    return player;
  },

  getPlayer(id) {
    return db.prepare('SELECT * FROM players WHERE id = ?').get(id);
  },

  getPlayerByNick(nickname) {
    return db.prepare('SELECT * FROM players WHERE nickname = ?').get(nickname);
  },

  // ── Sessions / Score ─────────────────────────────────────

  /**
   * Registra uma partida e atualiza o score mensal.
   */
  submitScore({ playerId, score, kills, waveReached, durationSec }) {
    const mk = monthKey();
    const ts = now();
    const sessionId = uuidv4();

    // 1) Insere sessão
    db.prepare(`
      INSERT INTO game_sessions (id, player_id, score, kills, wave_reached, duration_sec, played_at, month_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, playerId, score, kills, waveReached, durationSec, ts, mk);

    // 2) Atualiza estatísticas do player
    db.prepare(`
      UPDATE players
      SET total_games = total_games + 1,
          total_kills = total_kills + ?,
          best_score  = MAX(best_score, ?),
          last_seen   = ?
      WHERE id = ?
    `).run(kills, score, ts, playerId);

    // 3) Upsert monthly_scores — soma das TOP 10 partidas do mês
    const topSessions = db.prepare(`
      SELECT SUM(score) as total, COUNT(*) as cnt, MAX(score) as best, SUM(kills) as kills
      FROM (
        SELECT score, kills FROM game_sessions
        WHERE player_id = ? AND month_key = ?
        ORDER BY score DESC LIMIT 10
      )
    `).get(playerId, mk);

    const existing = db.prepare(
      'SELECT id FROM monthly_scores WHERE player_id = ? AND month_key = ?'
    ).get(playerId, mk);

    if (existing) {
      db.prepare(`
        UPDATE monthly_scores
        SET total_score  = ?,
            games_played = games_played + 1,
            best_score   = MAX(best_score, ?),
            total_kills  = total_kills + ?,
            updated_at   = ?
        WHERE player_id = ? AND month_key = ?
      `).run(topSessions.total, score, kills, ts, playerId, mk);
    } else {
      db.prepare(`
        INSERT INTO monthly_scores (id, player_id, month_key, total_score, games_played, best_score, total_kills, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `).run(uuidv4(), playerId, mk, topSessions.total, score, kills, ts);
    }

    return sessionId;
  },

  // ── Leaderboard ──────────────────────────────────────────

  /**
   * Retorna o ranking mensal (top 100) para um mês.
   * @param {string} mk - "YYYY-MM" (padrão: mês atual)
   */
  getMonthlyLeaderboard(mk = monthKey(), limit = 100) {
    return db.prepare(`
      SELECT
        ROW_NUMBER() OVER (ORDER BY ms.total_score DESC) AS rank,
        p.nickname,
        p.wallet,
        ms.total_score,
        ms.best_score,
        ms.games_played,
        ms.total_kills,
        ms.player_id,
        ap.balance      AS ap_balance,
        ap.total_earned AS ap_total_earned
      FROM monthly_scores ms
      JOIN players         p  ON p.id  = ms.player_id
      JOIN airdrop_points  ap ON ap.player_id = ms.player_id
      WHERE ms.month_key = ?
      ORDER BY ms.total_score DESC
      LIMIT ?
    `).all(mk, limit);
  },

  /**
   * Posição de um jogador específico no ranking do mês.
   */
  getPlayerRank(playerId, mk = monthKey()) {
    const row = db.prepare(`
      SELECT rank FROM (
        SELECT player_id,
               ROW_NUMBER() OVER (ORDER BY total_score DESC) AS rank
        FROM monthly_scores WHERE month_key = ?
      ) WHERE player_id = ?
    `).get(mk, playerId);
    return row ? row.rank : null;
  },

  // ── Airdrop Points ───────────────────────────────────────

  getAirdropBalance(playerId) {
    return db.prepare('SELECT * FROM airdrop_points WHERE player_id = ?').get(playerId);
  },

  addAirdropPoints(playerId, amount) {
    db.prepare(`
      UPDATE airdrop_points
      SET balance      = balance + ?,
          total_earned = total_earned + ?,
          last_reward  = ?
      WHERE player_id = ?
    `).run(amount, amount, now(), playerId);
  },

  // ── Daily Rewards ────────────────────────────────────────

  /**
   * Verifica se o jogador já recebeu recompensa hoje.
   */
  hasClaimedToday(playerId) {
    const today = dateKey();
    return !!db.prepare(
      'SELECT id FROM reward_history WHERE player_id = ? AND reward_date = ?'
    ).get(playerId, today);
  },

  /**
   * Registra uma recompensa distribuída.
   */
  recordReward({ playerId, rank, tier, points, scoreSnapshot }) {
    const mk    = monthKey();
    const today = dateKey();
    db.prepare(`
      INSERT INTO reward_history (id, player_id, month_key, reward_date, rank_position, rank_tier, points_awarded, score_snapshot, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), playerId, mk, today, rank, tier, points, scoreSnapshot, now());
    DB.addAirdropPoints(playerId, points);
  },

  /**
   * Histórico de recompensas de um jogador.
   */
  getRewardHistory(playerId, limit = 30) {
    return db.prepare(`
      SELECT * FROM reward_history
      WHERE player_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(playerId, limit);
  },

  /**
   * Total de airdrop-points distribuídos no mês.
   */
  getMonthlyDistribution(mk = monthKey()) {
    return db.prepare(`
      SELECT SUM(points_awarded) as total, COUNT(DISTINCT player_id) as players
      FROM reward_history WHERE month_key = ?
    `).get(mk);
  },

  // ── Estatísticas globais ──────────────────────────────────

  getGlobalStats() {
    return {
      totalPlayers:   db.prepare('SELECT COUNT(*) as n FROM players').get().n,
      totalGames:     db.prepare('SELECT COUNT(*) as n FROM game_sessions').get().n,
      totalKills:     db.prepare('SELECT SUM(total_kills) as n FROM players').get().n || 0,
      totalAirdrop:   db.prepare('SELECT SUM(total_earned) as n FROM airdrop_points').get().n || 0,
      thisMonth:      monthKey(),
    };
  },
};

module.exports = { DB, monthKey, dateKey };
