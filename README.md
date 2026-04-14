# 🔫 Shadow Strike — Browser FPS (WebGL + Three.js)

Jogo FPS (First Person Shooter) rodando diretamente no navegador, construído com **Three.js** e **JavaScript ES Modules** puro — sem bundler necessário.

## 🎮 Como Jogar

| Tecla | Ação |
|-------|------|
| `W A S D` | Mover |
| `Mouse` | Mirar |
| `LMB (clique)` | Atirar |
| `R` | Recarregar |
| `Shift` | Correr |
| `ESC` | Pausar / Menu |

1. Abra `index.html` num servidor HTTP (não funciona com `file://`)
2. Clique em **"Iniciar Jogo"**
3. Elimine todos os inimigos de cada onda para avançar!

## 🚀 Executar Localmente

```bash
# Python 3
python3 -m http.server 3000

# Node.js (npx)
npx serve .

# VSCode Live Server — extensão recomendada
```

Acesse: `http://localhost:3000`

## 🏗️ Arquitetura Modular

```
src/
├── main.js              # Ponto de entrada
├── Game.js              # Orquestrador (Game State Machine)
│
├── core/
│   ├── Renderer.js      # WebGLRenderer + câmera + loop
│   └── InputManager.js  # Teclado + Pointer Lock API
│
├── entities/
│   ├── Player.js        # Movimento FPS + vida + head-bob
│   ├── Weapon.js        # Hitscan + animação + munição
│   └── Enemy.js         # IA com FSM (Idle→Chase→Attack→Dead)
│
├── systems/
│   ├── CollisionSystem.js  # AABB + raycasting
│   ├── EnemyManager.js     # Pool de inimigos + ondas
│   └── ParticleSystem.js   # Sangue/faíscas (pool de objetos)
│
├── levels/
│   └── Level.js         # Mapa + obstáculos + iluminação
│
├── ui/
│   └── HUD.js           # Vida, munição, score, kill feed
│
└── audio/
    └── AudioManager.js  # Web Audio API (sons procedurais)
```

## ⚙️ Sistemas Implementados

### 🎯 Player (FPS Controller)
- Câmera em primeira pessoa com **Pointer Lock API**
- Movimento WASD fluido com colisão resolvida por AABB
- **Head-bob** animado ao caminhar/correr
- Sistema de vida com callbacks de hurt/death

### 🔫 Arma
- Modelo 3D procedural com **animação de recuo** e sway
- **Flash do cano** ao atirar
- Sistema de **hitscan** (raycasting instantâneo)
- Munição com **pente + reserva**, sistema de recarga com temporizador
- Marcas de impacto na cena

### 🤖 IA dos Inimigos
- **FSM** (Finite State Machine): Idle → Chase → Attack → Dead
- Detecção por raio de distância
- Steering behavior para perseguição
- **Separação entre agentes** (evita sobreposição)
- Animação de caminhada (braços e pernas)
- **Health bar** billboard sempre voltada para câmera
- Flash de dano + animação de morte

### 🌊 Sistema de Ondas
- Inimigos crescentes a cada onda
- Spawn em pontos afastados do jogador
- Pausa de 5 segundos entre ondas
- Notificação visual e sonora

### 💥 Colisão (AABB)
- Resolução de colisão do jogador com paredes/obstáculos
- Sliding suave ao colidir
- Raycasting para detecção de hit

### 🎨 Partículas
- **Pool de objetos** (sem alocação dinâmica)
- Sangue ao acertar inimigos
- Faíscas ao acertar paredes

### 🔊 Áudio (Web Audio API)
- Sons **completamente procedurais** (sem arquivos externos)
- Tiro, recarga, dano, morte de inimigo, nova onda, game over

### 🖥️ HUD
- Barra de vida com gradiente dinâmico (verde → amarelo → vermelho)
- Ícones de balas individuais
- Kill feed com animação de fade
- Barra de recarga
- Notificação de onda
- Flash de dano na tela
- Painel de Game Over com estatísticas

## 🛠️ Tecnologias

- **Three.js r164** — via CDN + Import Maps (nativo no navegador)
- **WebGL** — renderização 3D
- **Pointer Lock API** — captura de mouse para FPS
- **Web Audio API** — sons procedurais
- **ES Modules** — código modular sem bundler
- **CSS3** — HUD responsivo com backdrop-filter

## 📦 Dependências

Nenhuma instalação necessária! Apenas um servidor HTTP estático.
Three.js é carregado via CDN através de **Import Maps** (suportado em todos os browsers modernos).

## 🔧 Como Expandir

- **Novos inimigos**: Estender `Enemy.js` com novos modelos e IA
- **Novas armas**: Criar classes derivadas de `Weapon.js`
- **Mais mapas**: Adicionar arquivos em `src/levels/`
- **Power-ups**: Sistema de coleta (health pack, ammo)
- **Multiplayer**: Integrar WebSocket com servidor Node.js
