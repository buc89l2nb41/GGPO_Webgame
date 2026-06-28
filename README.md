# GGPO Web Fighting Game

A browser-based 2D fighting game with rollback netcode, built with React, TypeScript, and WebRTC.

![GGPO Fighter](https://img.shields.io/badge/Game-Fighting-red)
![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![WebRTC](https://img.shields.io/badge/WebRTC-P2P-green)

## Features

- **Rollback Netcode**: GGPO-style rollback implementation for smooth online play
- **Deterministic Simulation**: Fixed timestep (60 FPS) game loop ensuring consistent gameplay
- **WebRTC P2P**: Direct peer-to-peer connections for low latency
- **Local Multiplayer**: Practice mode with two players on one keyboard
- **Frame Data System**: Proper hitbox/hurtbox collision with startup, active, and recovery frames
- **Character State Machine**: Full fighting game state transitions

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Game Rendering**: HTML5 Canvas 2D
- **Networking**: WebRTC (PeerJS) + Socket.io
- **State Management**: Zustand
- **Signaling Server**: Node.js + Express + Socket.io

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
```

### Running the Game

**Development Mode:**

```bash
# Terminal 1: Start the signaling server
cd server
npm run dev

# Terminal 2: Start the client
cd client
npm run dev
```

**Production Build:**

```bash
# Build client
cd client
npm run build

# Build server
cd server
npm run build
npm start
```

### Controls

**Player 1:**
| Action | Key |
|--------|-----|
| Move Up | W |
| Move Down | S |
| Move Left | A |
| Move Right | D |
| Light Punch | U |
| Heavy Punch | I |
| Light Kick | J |
| Heavy Kick | K |

**Player 2:**
| Action | Key |
|--------|-----|
| Move Up | Arrow Up |
| Move Down | Arrow Down |
| Move Left | Arrow Left |
| Move Right | Arrow Right |
| Light Punch | Numpad 7 |
| Heavy Punch | Numpad 8 |
| Light Kick | Numpad 4 |
| Heavy Kick | Numpad 5 |

**System:**
- Pause: ESC
- Restart: F5

## Project Structure

```
GGPO_Webgame/
├── client/                    # Frontend application
│   ├── src/
│   │   ├── components/        # React UI components
│   │   │   ├── GameCanvas.tsx # Main game canvas
│   │   │   ├── Lobby.tsx      # Online lobby
│   │   │   └── HUD.tsx        # In-game HUD
│   │   ├── game/
│   │   │   ├── engine/        # Core game engine
│   │   │   │   ├── GameLoop.ts
│   │   │   │   ├── GameState.ts
│   │   │   │   ├── GameUpdate.ts
│   │   │   │   └── Renderer.ts
│   │   │   ├── systems/       # Game systems
│   │   │   │   ├── InputSystem.ts
│   │   │   │   ├── PhysicsSystem.ts
│   │   │   │   └── CollisionSystem.ts
│   │   │   ├── entities/      # Game entities
│   │   │   │   └── Character.ts
│   │   │   └── data/          # Character/move data
│   │   │       └── characters/
│   │   │           └── BaseCharacter.ts
│   │   ├── network/
│   │   │   ├── ggpo/          # GGPO rollback netcode
│   │   │   │   ├── GGPOSession.ts
│   │   │   │   ├── InputBuffer.ts
│   │   │   │   └── StateManager.ts
│   │   │   └── webrtc/        # WebRTC connection
│   │   │       └── PeerConnection.ts
│   │   └── assets/            # Sprites, sounds
│   └── package.json
├── server/                    # Signaling server
│   ├── src/
│   │   ├── index.ts           # Server entry point
│   │   └── matchmaking.ts     # Matchmaking logic
│   └── package.json
└── README.md
```

## Game Architecture

### Deterministic Simulation

The game uses a fixed timestep (60 FPS) with integer-based calculations to ensure deterministic behavior across different machines. Key points:

- All positions use integers (multiplied by 100 for sub-pixel precision)
- No floating-point operations in game logic
- Seeded random number generator for any randomness
- Complete state serialization for rollback

### GGPO Rollback Flow

```
┌─────────────────────────────────────────────────────────┐
│  Frame N                                                 │
├─────────────────────────────────────────────────────────┤
│  1. Read local input                                     │
│  2. Predict remote input (use last known)                │
│  3. Save state snapshot                                  │
│  4. Simulate frame                                       │
│  5. Send local input to remote                           │
├─────────────────────────────────────────────────────────┤
│  When remote input arrives (Frame N-2):                  │
│  1. Compare with prediction                              │
│  2. If mismatch: rollback to Frame N-2                   │
│  3. Resimulate frames N-2 to N with correct inputs       │
│  4. Continue from current frame                          │
└─────────────────────────────────────────────────────────┘
```

### Character Frame Data

Each move has defined frame data:
- **Startup**: Frames before the attack becomes active
- **Active**: Frames where the hitbox can hit
- **Recovery**: Frames after the attack where the character cannot act
- **Hitstun/Blockstun**: How long the opponent is frozen on hit/block

## Online Play

### Room System
1. **Create Room**: Generate a 6-character room code
2. **Join Room**: Enter a room code to connect
3. **Quick Match**: Automatically find an opponent

### Network Architecture
```
Player A <──WebRTC DataChannel──> Player B
    │                                │
    └──────> Signaling Server <──────┘
              (Socket.io)
```

## Development Status

- [x] Phase 1: Project setup and game loop
- [x] Phase 2: Character system and attacks
- [x] Phase 3: GGPO rollback netcode
- [x] Phase 4: WebRTC P2P networking
- [x] Phase 5: UI and polish

## Portfolio Highlights

This project demonstrates:

1. **Rollback Netcode Implementation** - Core fighting game networking technique
2. **Deterministic Simulation** - Synchronization problem solving
3. **WebRTC P2P** - Real-time communication technology
4. **Game Engine Architecture** - State machine, ECS patterns
5. **TypeScript** - Type safety in complex codebase
6. **Full-Stack Development** - React frontend + Node.js backend

## Future Improvements

- [ ] Add pixel art sprites
- [ ] Implement combo system
- [ ] Add more characters
- [ ] Sound effects and music
- [ ] Training mode
- [ ] Replay system
- [ ] Spectator mode

## License

MIT

## Credits

- GGPO concept by Tony Cannon
- Inspired by classic fighting games
