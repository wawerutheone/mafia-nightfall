import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// 🔥 SUPABASE CONFIGURATION
// ============================================================================
const USE_SUPABASE = false; // Set to true when ready
const SUPABASE_URL = "https://pnjibxztnpjgphuwlxrp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuamlieHp0bnBqZ3BodXdseHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDQxMjYsImV4cCI6MjA3OTEyMDEyNn0.Uc8660J15OBPyTAhsFH8XM2bzgTQiFljHl4H5u_i1g4";

let supabaseClient = null;

// ============================================================================
// DATABASE ABSTRACTION
// ============================================================================
class Database {
  constructor() {
    this.mockData = {};
    this.listeners = {};
  }

  async setRoom(roomCode, data) {
    this.mockData[roomCode] = data;
    this.triggerListeners(roomCode);
    return true;
  }

  async getRoom(roomCode) {
    return this.mockData[roomCode] || null;
  }

  async updateRoom(roomCode, updates) {
    this.mockData[roomCode] = { ...this.mockData[roomCode], ...updates };
    this.triggerListeners(roomCode);
    return true;
  }

  subscribeToRoom(roomCode, callback) {
    if (!this.listeners[roomCode]) this.listeners[roomCode] = [];
    this.listeners[roomCode].push(callback);
    setTimeout(() => callback(this.mockData[roomCode]), 100);
    return () => {
      this.listeners[roomCode] = this.listeners[roomCode].filter(cb => cb !== callback);
    };
  }

  triggerListeners(roomCode) {
    if (this.listeners[roomCode]) {
      this.listeners[roomCode].forEach(cb => cb(this.mockData[roomCode]));
    }
  }
}

const database = new Database();

// ============================================================================
// GAME CONSTANTS
// ============================================================================
const ROLES = {
  MAFIA: { name: 'Mafia', team: 'mafia', icon: '🔪', action: 'mafiaVote', priority: 3 },
  MAFIA_BOSS: { name: 'Mafia Boss', team: 'mafia', icon: '👑', action: 'mafiaVote', priority: 3, immune: true },
  GODFATHER: { name: 'Godfather', team: 'mafia', icon: '🎩', action: 'mafiaVote', priority: 3, immune: true },
  VILLAGER: { name: 'Villager', team: 'village', icon: '👤', action: null, priority: 0 },
  DOCTOR: { name: 'Doctor', team: 'village', icon: '⚕️', action: 'doctorSave', priority: 1 },
  DETECTIVE: { name: 'Detective', team: 'village', icon: '🔍', action: 'detectiveInspect', priority: 2 },
  BODYGUARD: { name: 'Bodyguard', team: 'village', icon: '🛡️', action: 'bodyguardProtect', priority: 1 },
  VIGILANTE: { name: 'Vigilante', team: 'village', icon: '🎯', action: 'vigilanteShoot', priority: 4 },
  SHERIFF: { name: 'Sheriff', team: 'village', icon: '⭐', action: 'sheriffInvestigate', priority: 2 },
  JESTER: { name: 'Jester', team: 'neutral', icon: '🤡', action: null, priority: 0 }
};

const PHASES = {
  LOBBY: 'lobby',
  NIGHT: 'night',
  DAY: 'day',
  VOTING: 'voting',
  GAME_OVER: 'gameOver'
};

const PHASE_TIMERS = {
  [PHASES.NIGHT]: 45,
  [PHASES.DAY]: 60,
  [PHASES.VOTING]: 30
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function assignRoles(playerCount) {
  const roles = [];
  
  if (playerCount >= 4 && playerCount <= 6) {
    roles.push('MAFIA', 'DOCTOR', 'DETECTIVE');
    while (roles.length < playerCount) roles.push('VILLAGER');
  } else if (playerCount >= 7 && playerCount <= 10) {
    roles.push('MAFIA', 'MAFIA', 'DOCTOR', 'DETECTIVE', 'BODYGUARD', 'SHERIFF');
    while (roles.length < playerCount) roles.push('VILLAGER');
  } else {
    roles.push('MAFIA', 'MAFIA', 'GODFATHER', 'DOCTOR', 'DETECTIVE', 'BODYGUARD', 'VIGILANTE', 'JESTER');
    while (roles.length < playerCount) roles.push('VILLAGER');
  }
  
  return roles.sort(() => Math.random() - 0.5);
}

function createAIPlayer(index) {
  const names = ['Thompson', 'O\'Brien', 'McCarthy', 'Sullivan', 'Doyle', 'Murphy', 'Kennedy', 'Ryan'];
  return {
    id: `ai_${Date.now()}_${index}`,
    username: names[index % names.length],
    isAI: true,
    isHost: false,
    isDead: false
  };
}

// ============================================================================
// MAIN APP
// ============================================================================
function MafiaGame() {
  const [screen, setScreen] = useState('home');
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [playerId, setPlayerId] = useState(null);
  const [room, setRoom] = useState(null);
  const [myRole, setMyRole] = useState(null);
  const [notification, setNotification] = useState(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    let id = localStorage.getItem('mafiaPlayerId');
    if (!id) {
      id = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('mafiaPlayerId', id);
    }
    setPlayerId(id);
  }, []);

  useEffect(() => {
    if (!roomCode || !playerId) return;

    const unsubscribe = database.subscribeToRoom(roomCode, (data) => {
      if (data) {
        setRoom(data);
        
        if (data.phase !== PHASES.LOBBY && data.players) {
          const myPlayer = data.players.find(p => p.id === playerId);
          if (myPlayer && myPlayer.role && !myRole) {
            setMyRole(ROLES[myPlayer.role]);
            setShowRoleModal(true);
          }
        }

        if (data.phase !== PHASES.LOBBY && screen === 'lobby') {
          setScreen('game');
        }
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [roomCode, playerId]);

  useEffect(() => {
    if (!room || !roomCode || room.phase === PHASES.LOBBY || room.phase === PHASES.GAME_OVER) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (room.host_id === playerId && !timerRef.current) {
      timerRef.current = setInterval(async () => {
        const currentTimer = room.timer || PHASE_TIMERS[room.phase];
        
        if (currentTimer <= 1) {
          await advancePhase(room.phase);
        } else {
          await database.updateRoom(roomCode, { timer: currentTimer - 1 });
        }
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [room, roomCode, playerId]);

  const advancePhase = async (currentPhase) => {
    if (currentPhase === PHASES.NIGHT) {
      const result = await resolveNightActions();
      await database.updateRoom(roomCode, {
        phase: PHASES.DAY,
        timer: PHASE_TIMERS[PHASES.DAY],
        night_actions: {},
        last_night_result: result
      });
      showNotification(result);
    } else if (currentPhase === PHASES.DAY) {
      await database.updateRoom(roomCode, {
        phase: PHASES.VOTING,
        timer: PHASE_TIMERS[PHASES.VOTING],
        votes: {}
      });
    } else if (currentPhase === PHASES.VOTING) {
      await resolveVotes();
      const winner = checkWinCondition();
      
      if (winner) {
        await database.updateRoom(roomCode, {
          phase: PHASES.GAME_OVER,
          winner,
          timer: null
        });
      } else {
        await database.updateRoom(roomCode, {
          phase: PHASES.NIGHT,
          timer: PHASE_TIMERS[PHASES.NIGHT],
          votes: {},
          night_actions: {}
        });
        
        setTimeout(() => simulateAIActions(PHASES.NIGHT), 2000);
      }
    }
  };

  const resolveNightActions = async () => {
    const actions = room.night_actions || {};
    const players = [...room.players];
    let killed = [];
    
    const mafiaVotes = {};
    Object.entries(actions).forEach(([playerId, action]) => {
      if (action.action === 'mafiaVote') {
        mafiaVotes[action.targetId] = (mafiaVotes[action.targetId] || 0) + 1;
      }
    });
    
    const mafiaTarget = Object.keys(mafiaVotes).sort((a, b) => mafiaVotes[b] - mafiaVotes[a])[0];
    if (mafiaTarget) killed.push(mafiaTarget);

    Object.entries(actions).forEach(([playerId, action]) => {
      if (action.action === 'doctorSave' && killed.includes(action.targetId)) {
        killed = killed.filter(id => id !== action.targetId);
      }
    });

    const updatedPlayers = players.map(p => ({
      ...p,
      isDead: p.isDead || killed.includes(p.id)
    }));

    await database.updateRoom(roomCode, { players: updatedPlayers });

    if (killed.length === 0) {
      return 'NOBODY KILLED - DOCTOR INTERVENED';
    } else {
      const victim = players.find(p => p.id === killed[0]);
      return `${victim?.username.toUpperCase()} FOUND DEAD`;
    }
  };

  const resolveVotes = async () => {
    const votes = room.votes || {};
    const voteCounts = {};
    
    Object.values(votes).forEach(targetId => {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    });

    const eliminated = Object.keys(voteCounts).sort((a, b) => voteCounts[b] - voteCounts[a])[0];
    
    if (eliminated) {
      const updatedPlayers = room.players.map(p => ({
        ...p,
        isDead: p.isDead || p.id === eliminated
      }));

      await database.updateRoom(roomCode, { players: updatedPlayers });
      
      const victim = room.players.find(p => p.id === eliminated);
      showNotification(`${victim?.username.toUpperCase()} EXECUTED - ${ROLES[victim?.role]?.name.toUpperCase()}`);
    }

    return eliminated;
  };

  const checkWinCondition = () => {
    const alive = room.players.filter(p => !p.isDead);
    const mafia = alive.filter(p => ROLES[p.role]?.team === 'mafia');
    const village = alive.filter(p => ROLES[p.role]?.team === 'village');

    if (mafia.length === 0) return 'TOWN';
    if (mafia.length >= village.length) return 'MAFIA';
    return null;
  };

  const showNotification = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 4000);
  };

  const createRoom = async (withAI = false) => {
    if (!username.trim()) {
      showNotification('ENTER NAME FIRST');
      return;
    }

    const code = generateRoomCode();
    const players = [{
      id: playerId,
      username: username.trim().toUpperCase(),
      isHost: true,
      isAI: false,
      isDead: false,
      role: null
    }];

    if (withAI) {
      for (let i = 0; i < 5; i++) {
        players.push(createAIPlayer(i));
      }
    }

    await database.setRoom(code, {
      room_code: code,
      host_id: playerId,
      phase: PHASES.LOBBY,
      players,
      messages: [],
      timer: null,
      night_actions: {},
      votes: {},
      created_at: Date.now()
    });

    setRoomCode(code);
    setScreen('lobby');
    showNotification('OPERATION ESTABLISHED');
  };

  const joinRoom = async () => {
    if (!username.trim() || !roomCode.trim()) {
      showNotification('ENTER NAME AND CODE');
      return;
    }

    const code = roomCode.toUpperCase();
    const roomData = await database.getRoom(code);

    if (!roomData) {
      showNotification('ROOM NOT FOUND');
      return;
    }

    if (roomData.phase !== PHASES.LOBBY) {
      showNotification('GAME IN PROGRESS');
      return;
    }

    const newPlayer = {
      id: playerId,
      username: username.trim().toUpperCase(),
      isHost: false,
      isAI: false,
      isDead: false,
      role: null
    };

    await database.updateRoom(code, {
      players: [...roomData.players, newPlayer]
    });
    
    setRoomCode(code);
    setScreen('lobby');
    showNotification('INFILTRATION SUCCESSFUL');
  };

  const startGame = async () => {
    if (!room || room.players.length < 4) {
      showNotification('NEED 4 MINIMUM');
      return;
    }

    const roles = assignRoles(room.players.length);
    const updatedPlayers = room.players.map((player, idx) => ({
      ...player,
      role: roles[idx]
    }));

    await database.updateRoom(roomCode, {
      phase: PHASES.NIGHT,
      players: updatedPlayers,
      timer: PHASE_TIMERS[PHASES.NIGHT],
      night_actions: {},
      votes: {}
    });

    showNotification('OPERATION COMMENCING');
    setTimeout(() => simulateAIActions(PHASES.NIGHT), 3000);
  };

  const simulateAIActions = async (phase) => {
    const aiPlayers = room.players.filter(p => p.isAI && !p.isDead);
    
    for (const ai of aiPlayers) {
      const role = ROLES[ai.role];
      if (role && role.action && phase === PHASES.NIGHT) {
        const targets = room.players.filter(p => p.id !== ai.id && !p.isDead);
        if (targets.length > 0) {
          const target = targets[Math.floor(Math.random() * targets.length)];
          const currentActions = room.night_actions || {};
          await database.updateRoom(roomCode, {
            night_actions: {
              ...currentActions,
              [ai.id]: { action: role.action, targetId: target.id }
            }
          });
        }
      } else if (phase === PHASES.VOTING) {
        const targets = room.players.filter(p => p.id !== ai.id && !p.isDead);
        if (targets.length > 0) {
          const target = targets[Math.floor(Math.random() * targets.length)];
          const currentVotes = room.votes || {};
          await database.updateRoom(roomCode, {
            votes: { ...currentVotes, [ai.id]: target.id }
          });
        }
      }
    }
  };

  const submitNightAction = async (targetId) => {
    if (!myRole || !myRole.action) return;

    const currentActions = room.night_actions || {};
    await database.updateRoom(roomCode, {
      night_actions: {
        ...currentActions,
        [playerId]: { action: myRole.action, targetId, timestamp: Date.now() }
      }
    });

    showNotification('ORDER CONFIRMED');
  };

  const submitVote = async (targetId) => {
    const currentVotes = room.votes || {};
    await database.updateRoom(roomCode, {
      votes: { ...currentVotes, [playerId]: targetId }
    });
    showNotification('VOTE RECORDED');
  };

  const sendMessage = async (message) => {
    const myPlayer = room.players.find(p => p.id === playerId);
    
    const newMessage = {
      id: Date.now(),
      playerId,
      username: myPlayer?.username || 'UNKNOWN',
      message: message.trim(),
      timestamp: Date.now()
    };

    const messages = room.messages || [];
    await database.updateRoom(roomCode, {
      messages: [...messages.slice(-50), newMessage]
    });
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden" style={{ fontFamily: "'Courier New', monospace" }}>
      {/* GLOBAL NOIR STYLES */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Special+Elite&family=Playfair+Display:wght@700&display=swap');
        
        body {
          background: #000;
          color: #d4c5b0;
        }
        
        .noir-paper {
          background: linear-gradient(135deg, #2a2318 0%, #1a1410 100%);
          background-image: 
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E"),
            linear-gradient(135deg, #2a2318 0%, #1a1410 100%);
        }
        
        .film-grain {
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23grain)' opacity='0.15'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 9999;
          mix-blend-mode: overlay;
        }
        
        .vignette {
          position: fixed;
          inset: 0;
          background: radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.9) 100%);
          pointer-events: none;
          z-index: 9998;
        }
        
        .typewriter {
          font-family: 'Special Elite', 'Courier New', monospace;
          letter-spacing: 0.05em;
        }
        
        .serif {
          font-family: 'Playfair Display', Georgia, serif;
        }
        
        .gold-accent {
          color: #8B7355;
        }
        
        @keyframes smoke-rise {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          20% { opacity: 0.3; }
          100% { transform: translateY(-100vh) scale(2); opacity: 0; }
        }
        
        @keyframes rain {
          0% { transform: translateY(-10vh); opacity: 0; }
          10% { opacity: 0.5; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        
        @keyframes flicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
      `}</style>

      {/* Film Grain Overlay */}
      <div className="film-grain"></div>
      
      {/* Vignette */}
      <div className="vignette"></div>

      <AnimatePresence mode="wait">
        {screen === 'home' && (
          <HomeScreen
            username={username}
            setUsername={setUsername}
            roomCode={roomCode}
            setRoomCode={setRoomCode}
            onCreateRoom={() => createRoom(false)}
            onCreateWithAI={() => createRoom(true)}
            onJoinRoom={joinRoom}
          />
        )}
        
        {screen === 'lobby' && room && (
          <LobbyScreen
            room={room}
            roomCode={roomCode}
            playerId={playerId}
            onStartGame={startGame}
          />
        )}
        
        {screen === 'game' && room && myRole && (
          <GameScreen
            room={room}
            myRole={myRole}
            playerId={playerId}
            onSubmitNightAction={submitNightAction}
            onSubmitVote={submitVote}
            onSendMessage={sendMessage}
            showRoleModal={showRoleModal}
            setShowRoleModal={setShowRoleModal}
            isHost={room.host_id === playerId}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notification && <Notification message={notification} />}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// HOME SCREEN - RAINY 1930S LONDON STREET
// ============================================================================
function HomeScreen({ username, setUsername, roomCode, setRoomCode, onCreateRoom, onCreateWithAI, onJoinRoom }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex items-center justify-center p-4 relative"
    >
      {/* Rain Effect */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {[...Array(40)].map((_, i) => (
          <div
            key={i}
            className="absolute w-px h-12 bg-gradient-to-b from-transparent via-gray-400/30 to-transparent"
            style={{
              left: `${Math.random() * 100}%`,
              animationName: 'rain',
              animationDuration: `${0.5 + Math.random() * 0.3}s`,
              animationIterationCount: 'infinite',
              animationDelay: `${Math.random() * 2}s`,
              animationTimingFunction: 'linear'
            }}
          />
        ))}
      </div>

      {/* Fog/Smoke */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-gray-600 blur-3xl"
            style={{
              width: `${200 + i * 100}px`,
              height: `${200 + i * 100}px`,
              left: `${20 + i * 30}%`,
              bottom: `-100px`,
              animationName: 'smoke-rise',
              animationDuration: `${10 + i * 3}s`,
              animationIterationCount: 'infinite',
              animationDelay: `${i * 2}s`,
              animationTimingFunction: 'ease-out'
            }}
          />
        ))}
      </div>

      {/* Gas Lamp Glow */}
      <div className="fixed top-20 left-1/4 w-32 h-32 bg-yellow-800/20 rounded-full blur-3xl" style={{ animation: 'flicker 3s infinite' }}></div>
      <div className="fixed top-20 right-1/4 w-32 h-32 bg-yellow-800/20 rounded-full blur-3xl" style={{ animation: 'flicker 4s infinite' }}></div>

      {/* Main Dossier */}
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="noir-paper border-2 border-gray-800 p-8 max-w-md w-full relative"
        style={{ boxShadow: '8px 8px 0 rgba(0,0,0,0.5)' }}
      >
        {/* Title */}
        <div className="text-center mb-8 pb-6 border-b-2 border-dashed border-gray-700">
          <h1 className="serif text-5xl mb-2 gold-accent" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
            MAFIA
          </h1>
          <p className="typewriter text-xs text-gray-600">LONDON 1930</p>
        </div>

        {/* Input */}
        <div className="mb-4">
          <label className="typewriter text-xs text-gray-600 block mb-2">ALIAS:</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && onCreateRoom()}
            className="w-full px-3 py-2 bg-black/40 border border-gray-700 typewriter text-sm outline-none focus:border-gray-600"
            style={{ boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}
            maxLength={20}
          />
        </div>

        {/* Buttons */}
        <button
          onClick={onCreateRoom}
          className="w-full mb-3 px-4 py-3 border-2 border-gray-700 typewriter text-xs hover:bg-gray-900/50 transition-colors"
          style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.5)' }}
        >
          [ ESTABLISH OPERATION ]
        </button>

        <button
          onClick={onCreateWithAI}
          className="w-full mb-6 px-4 py-3 border-2 border-gray-700 typewriter text-xs hover:bg-gray-900/50 transition-colors"
          style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.5)' }}
        >
          [ RECRUIT INFORMANTS +5 ]
        </button>

        {/* Divider */}
        <div className="relative my-6">
          <div className="border-t border-dashed border-gray-700"></div>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#2a2318] px-3">
            <span className="typewriter text-xs text-gray-600">OR</span>
          </div>
        </div>

        {/* Join */}
        <div className="mb-4">
          <label className="typewriter text-xs text-gray-600 block mb-2">ACCESS CODE:</label>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            onKeyPress={(e) => e.key === 'Enter' && onJoinRoom()}
            className="w-full px-3 py-2 bg-black/40 border border-gray-700 typewriter text-lg text-center tracking-widest outline-none focus:border-gray-600"
            style={{ boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}
            maxLength={6}
          />
        </div>

        <button
          onClick={onJoinRoom}
          className="w-full px-4 py-3 border-2 border-gray-700 typewriter text-xs hover:bg-gray-900/50 transition-colors"
          style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.5)' }}
        >
          [ JOIN SYNDICATE ]
        </button>

        {/* Stamp */}
        <div className="mt-6 text-center">
          <div className="inline-block border-2 border-red-900/50 px-4 py-2 transform -rotate-6">
            <span className="typewriter text-xs text-red-900/50">CLASSIFIED</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================================================
// LOBBY SCREEN - DARK ALLEY WITH SEPIA FOG
// ============================================================================
function LobbyScreen({ room, roomCode, playerId, onStartGame }) {
  const isHost = room.host_id === playerId;
  const canStart = room.players.length >= 4;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen p-4 md:p-8"
    >
      {/* Fog Effect */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-10">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-gray-600 blur-3xl"
            style={{
              width: `${250 + i * 100}px`,
              height: `${250 + i * 100}px`,
              left: `${10 + i * 30}%`,
              top: `${20 + i * 20}%`,
              animation: `smoke-rise ${15 + i * 5}s infinite ease-out`
            }}
          />
        ))}
      </div>

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="noir-paper inline-block border-2 border-gray-800 px-8 py-4 relative" style={{ boxShadow: '6px 6px 0 rgba(0,0,0,0.5)' }}>
            <h2 className="serif text-3xl mb-2 gold-accent">BRIEFING ROOM</h2>
            <div className="typewriter text-xs text-gray-600 mb-3">OPERATION CODE:</div>
            <div className="bg-black/60 border border-gray-700 px-6 py-2 inline-block">
              <span className="typewriter text-2xl tracking-widest">{roomCode}</span>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Player List - Police Folders */}
          <div className="md:col-span-2">
            <div className="noir-paper border-2 border-gray-800 p-6" style={{ boxShadow: '6px 6px 0 rgba(0,0,0,0.5)' }}>
              <div className="mb-6 pb-4 border-b-2 border-dashed border-gray-700">
                <h3 className="serif text-xl gold-accent">SYNDICATE ROSTER</h3>
                <p className="typewriter text-xs text-gray-600 mt-1">[{room.players.length}/20 OPERATIVES]</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {room.players.map((player, idx) => (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`border-2 p-3 ${player.isHost ? 'border-gray-600 bg-gray-900/30' : 'border-gray-800 bg-black/20'}`}
                    style={{ boxShadow: '3px 3px 0 rgba(0,0,0,0.5)' }}
                  >
                    {/* Mugshot Frame */}
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 border border-gray-700 bg-gray-900 flex items-center justify-center">
                        <span className="text-2xl opacity-70">{player.isAI ? '🤖' : '👤'}</span>
                      </div>
                      <div className="flex-1">
                        <div className="typewriter text-sm">{player.username}</div>
                        <div className="typewriter text-xs text-gray-600">{player.isHost ? '[BOSS]' : '[MEMBER]'}</div>
                      </div>
                      {player.isHost && <span className="text-xl gold-accent">♛</span>}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Start Button */}
            {isHost && (
              <button
                onClick={onStartGame}
                disabled={!canStart}
                className={`w-full px-6 py-6 border-2 typewriter ${canStart ? 'border-gray-700 hover:bg-gray-900/50' : 'border-gray-800 opacity-50 cursor-not-allowed'}`}
                style={canStart ? { boxShadow: '6px 6px 0 rgba(0,0,0,0.5)' } : {}}
              >
                <div className="serif text-lg mb-1">BEGIN</div>
                <div className="text-xs text-gray-600">{canStart ? '[COMMENCE]' : '[NEED 4 MIN]'}</div>
              </button>
            )}

            {/* Rules */}
            <div className="noir-paper border-2 border-gray-800 p-4" style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.5)' }}>
              <h4 className="typewriter text-sm gold-accent mb-3 pb-2 border-b border-gray-800">PROTOCOL:</h4>
              <div className="space-y-2 text-xs typewriter text-gray-500 leading-relaxed">
                <div>• NIGHT: Execute orders</div>
                <div>• DAY: Interrogate suspects</div>
                <div>• VOTE: Eliminate traitors</div>
                <div>• MAFIA: Win by majority</div>
                <div>• TOWN: Eliminate mafia</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// GAME SCREEN - NIGHT/DAY/VOTING
// ============================================================================
function GameScreen({ room, myRole, playerId, onSubmitNightAction, onSubmitVote, onSendMessage, showRoleModal, setShowRoleModal, isHost }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [chatInput, setChatInput] = useState('');

  const isNight = room.phase === PHASES.NIGHT;
  const isVoting = room.phase === PHASES.VOTING;
  const isGameOver = room.phase === PHASES.GAME_OVER;
  const myPlayer = room.players.find(p => p.id === playerId);
  const canAct = isNight && myRole.action && !myPlayer?.isDead;
  const canVote = isVoting && !myPlayer?.isDead;
  const canChat = !isNight && !myPlayer?.isDead;

  const hasSubmitted = isNight 
    ? room.night_actions && room.night_actions[playerId]
    : room.votes && room.votes[playerId];

  const handleSubmit = () => {
    if (!selectedPlayer) return;
    if (isNight && canAct) onSubmitNightAction(selectedPlayer);
    else if (isVoting && canVote) onSubmitVote(selectedPlayer);
    setSelectedPlayer(null);
  };

  const handleSendMessage = () => {
    if (chatInput.trim() && canChat) {
      onSendMessage(chatInput);
      setChatInput('');
    }
  };

  const alivePlayers = room.players.filter(p => !p.isDead);
  const deadPlayers = room.players.filter(p => p.isDead);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen p-4">
      {/* Phase Banner */}
      <PhaseBanner phase={room.phase} timer={room.timer} winner={room.winner} />

      <div className="max-w-7xl mx-auto mt-28 pb-8">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Night Results - Newspaper */}
            {room.last_night_result && room.phase === PHASES.DAY && (
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="noir-paper border-4 border-gray-800 p-8 relative"
                style={{ boxShadow: '8px 8px 0 rgba(0,0,0,0.7)' }}
              >
                <div className="text-center mb-4 pb-4 border-b-2 border-dashed border-gray-700">
                  <div className="typewriter text-xs text-gray-600">THE LONDON CHRONICLE</div>
                  <h3 className="serif text-3xl mt-2">BREAKING NEWS</h3>
                </div>
                <p className="typewriter text-center text-lg">{room.last_night_result}</p>
              </motion.div>
            )}

            {/* Investigation Board - Alive */}
            <div className="noir-paper border-2 border-gray-800 p-6" style={{ boxShadow: '6px 6px 0 rgba(0,0,0,0.5)' }}>
              <h3 className="serif text-xl gold-accent mb-4 pb-3 border-b-2 border-dashed border-gray-700">
                SUSPECTS [{alivePlayers.length}]
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {alivePlayers.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => {
                      if ((canAct || canVote) && player.id !== playerId && !hasSubmitted) {
                        setSelectedPlayer(player.id);
                      }
                    }}
                    disabled={player.id === playerId || hasSubmitted || (!canAct && !canVote)}
                    className={`p-3 border-2 transition-all ${
                      selectedPlayer === player.id ? 'border-gray-600 bg-gray-900/50' : 'border-gray-800 bg-black/20'
                    } ${player.id === playerId || hasSubmitted || (!canAct && !canVote) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-700'}`}
                    style={{ boxShadow: '3px 3px 0 rgba(0,0,0,0.5)' }}
                  >
                    <div className="w-full h-16 border border-gray-700 bg-gray-900 flex items-center justify-center mb-2">
                      <span className="text-3xl opacity-70">{player.isAI ? '🤖' : '👤'}</span>
                    </div>
                    <div className="typewriter text-xs text-center">{player.username}</div>
                    {player.id === playerId && <div className="typewriter text-xs text-center text-gray-600 mt-1">[YOU]</div>}
                  </button>
                ))}
              </div>
            </div>

            {/* Casualties */}
            {deadPlayers.length > 0 && (
              <div className="noir-paper border-2 border-gray-800 p-6" style={{ boxShadow: '6px 6px 0 rgba(0,0,0,0.5)' }}>
                <h3 className="serif text-xl text-gray-600 mb-4 pb-3 border-b-2 border-dashed border-gray-800">
                  CASUALTIES [{deadPlayers.length}]
                </h3>
                <div className="flex flex-wrap gap-3">
                  {deadPlayers.map((player) => (
                    <div key={player.id} className="border border-gray-800 p-3 bg-black/30" style={{ boxShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 border border-gray-800 bg-black flex items-center justify-center">
                          <span className="text-lg opacity-30">💀</span>
                        </div>
                        <div className="text-xs typewriter">
                          <div className="text-gray-600">{player.username}</div>
                          <div className="text-gray-700">{ROLES[player.role]?.name}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Panel */}
            {(canAct || canVote) && !hasSubmitted && (
              <div className="noir-paper border-4 border-gray-700 p-8" style={{ boxShadow: '8px 8px 0 rgba(0,0,0,0.7)' }}>
                <h3 className="serif text-2xl gold-accent mb-4">
                  {isNight ? `${myRole.name} Order` : 'Cast Verdict'}
                </h3>
                <div className="bg-black/60 border-l-4 border-gray-700 p-4 mb-6">
                  <p className="typewriter text-sm text-gray-500">
                    {isNight ? 'Select target for operation' : 'Select suspect for elimination'}
                  </p>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={!selectedPlayer}
                  className={`w-full px-6 py-4 border-2 typewriter ${selectedPlayer ? 'border-gray-700 hover:bg-gray-900/50' : 'border-gray-800 opacity-50 cursor-not-allowed'}`}
                  style={selectedPlayer ? { boxShadow: '6px 6px 0 rgba(0,0,0,0.5)' } : {}}
                >
                  {isNight ? '[ EXECUTE ORDER ]' : '[ CAST VERDICT ]'}
                </button>
              </div>
            )}

            {/* Submitted Confirmation */}
            {hasSubmitted && (canAct || canVote) && (
              <div className="noir-paper border-4 border-gray-700 p-8 text-center" style={{ boxShadow: '8px 8px 0 rgba(0,0,0,0.7)' }}>
                <div className="border-4 border-gray-700 px-6 py-4 inline-block mb-4">
                  <span className="text-4xl">✓</span>
                </div>
                <p className="serif text-2xl mb-2">{isNight ? 'ORDER SENT' : 'VOTE RECORDED'}</p>
                <p className="typewriter text-xs text-gray-600">Awaiting others...</p>
              </div>
            )}

            {/* Game Over - Final Report */}
            {isGameOver && (
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="noir-paper border-8 border-gray-800 p-12 text-center"
                style={{ boxShadow: '12px 12px 0 rgba(0,0,0,0.8)' }}
              >
                <div className="text-8xl mb-6">{room.winner === 'MAFIA' ? '🔪' : '⚖️'}</div>
                <div className="mb-6">
                  <div className="typewriter text-xs text-gray-600 mb-2">FINAL EDITION</div>
                  <h2 className="serif text-6xl mb-4">CASE CLOSED</h2>
                  <div className="h-1 bg-gray-700 mb-4"></div>
                  <p className="serif text-4xl gold-accent">{room.winner} VICTORIOUS</p>
                </div>
                
                {/* Bullet casings */}
                <div className="flex justify-center gap-2 mt-6">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-3 h-6 bg-gradient-to-b from-gray-600 to-gray-800 rounded-full" style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }} />
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <RoleCard role={myRole} onClick={() => setShowRoleModal(true)} isDead={myPlayer?.isDead} />
            <ChatBox 
              messages={room.messages || []} 
              chatInput={chatInput} 
              setChatInput={setChatInput} 
              onSendMessage={handleSendMessage} 
              disabled={!canChat} 
            />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showRoleModal && <RoleModal role={myRole} onClose={() => setShowRoleModal(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================================================
// PHASE BANNER
// ============================================================================
function PhaseBanner({ phase, timer, winner }) {
  const isNight = phase === PHASES.NIGHT;
  const isGameOver = phase === PHASES.GAME_OVER;
  
  return (
    <div className="fixed top-0 left-0 right-0 z-50 noir-paper border-b-2 border-gray-800 py-4 px-6" style={{ boxShadow: '0 4px 8px rgba(0,0,0,0.8)' }}>
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-4xl">
            {isNight && '🌙'}
            {phase === PHASES.DAY && '☀️'}
            {phase === PHASES.VOTING && '⚖️'}
            {isGameOver && '🏁'}
          </span>
          <div>
            <div className="typewriter text-xs text-gray-600">STATUS:</div>
            <h2 className="serif text-2xl gold-accent">
              {isNight && 'NIGHT OPERATIONS'}
              {phase === PHASES.DAY && 'DAY ASSEMBLY'}
              {phase === PHASES.VOTING && 'JUDGMENT'}
              {isGameOver && 'CONCLUDED'}
            </h2>
          </div>
        </div>
        
        {timer && !isGameOver && (
          <div className="noir-paper border-2 border-gray-700 px-6 py-3" style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.5)' }}>
            <div className="typewriter text-xs text-gray-600 mb-1 text-center">TIME</div>
            <div className={`typewriter text-3xl ${timer <= 10 ? 'text-gray-400' : 'gold-accent'}`}>
              {timer}s
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ROLE CARD
// ============================================================================
function RoleCard({ role, onClick, isDead }) {
  if (!role) return null;
  
  return (
    <div
      onClick={onClick}
      className="noir-paper border-2 border-gray-800 p-6 cursor-pointer"
      style={{ boxShadow: '6px 6px 0 rgba(0,0,0,0.5)' }}
    >
      <div className="text-center">
        <div className={`text-6xl mb-3 ${isDead ? 'opacity-30' : ''}`}>
          {isDead ? '💀' : role.icon}
        </div>
        <h3 className="serif text-2xl gold-accent mb-2">{role.name}</h3>
        <div className="border border-gray-700 px-3 py-1 inline-block">
          <span className="typewriter text-xs">[{role.team.toUpperCase()}]</span>
        </div>
        {!isDead && <p className="typewriter text-xs text-gray-600 mt-3">TAP FOR DETAILS</p>}
        {isDead && <p className="typewriter text-xs text-gray-700 mt-3">[DECEASED]</p>}
      </div>
    </div>
  );
}

// ============================================================================
// CHAT BOX
// ============================================================================
function ChatBox({ messages, chatInput, setChatInput, onSendMessage, disabled }) {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="noir-paper border-2 border-gray-800 flex flex-col h-96" style={{ boxShadow: '6px 6px 0 rgba(0,0,0,0.5)' }}>
      <div className="p-4 border-b-2 border-gray-800">
        <h3 className="typewriter text-sm gold-accent">COMMUNICATIONS</h3>
        {disabled && <span className="typewriter text-xs text-gray-700 block mt-1">[OFFLINE]</span>}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="text-center text-gray-700 mt-12">
            <p className="typewriter text-xs">Radio silence...</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={msg.id || idx} className="bg-black/40 border border-gray-800 p-2" style={{ boxShadow: '2px 2px 0 rgba(0,0,0,0.3)' }}>
              <span className="typewriter text-xs text-gray-600">{msg.username}:</span>
              <span className="typewriter text-xs text-gray-400 ml-2">{msg.message}</span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t-2 border-gray-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && onSendMessage()}
            disabled={disabled}
            placeholder={disabled ? "[BLOCKED]" : "Type..."}
            className="flex-1 px-3 py-2 bg-black/40 border border-gray-700 typewriter text-xs outline-none focus:border-gray-600 disabled:opacity-50"
            style={{ boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}
            maxLength={200}
          />
          <button
            onClick={onSendMessage}
            disabled={disabled || !chatInput.trim()}
            className="px-4 py-2 border border-gray-700 typewriter text-xs disabled:opacity-50"
            style={{ boxShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}
          >
            SEND
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ROLE MODAL - CONFIDENTIAL DOSSIER
// ============================================================================
function RoleModal({ role, onClose }) {
  const descriptions = {
    MAFIA: 'Eliminate targets at night. Win by majority.',
    MAFIA_BOSS: 'Lead mafia operations. Immune to investigations.',
    GODFATHER: 'Kingpin. Immune to all investigations.',
    VILLAGER: 'Honest citizen. Find and eliminate mafia.',
    DOCTOR: 'Save one person from death each night.',
    DETECTIVE: 'Investigate players to learn allegiance.',
    BODYGUARD: 'Protect a player by taking the hit.',
    VIGILANTE: 'Eliminate suspected criminals at night.',
    SHERIFF: 'Investigate if players are suspicious.',
    JESTER: 'Win by getting eliminated during day phase.'
  };

  const roleKey = role.name.toUpperCase().replace(' ', '_');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.8, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="noir-paper border-4 border-gray-800 p-10 max-w-lg w-full relative"
        style={{ boxShadow: '12px 12px 0 rgba(0,0,0,0.8)' }}
      >
        {/* Stamp */}
        <div className="absolute top-4 right-4 border-2 border-red-900/50 px-3 py-2 transform rotate-12">
          <span className="typewriter text-xs text-red-900/50">TOP SECRET</span>
        </div>

        <div className="text-center mb-8 pb-6 border-b-2 border-dashed border-gray-700">
          <div className="typewriter text-xs text-gray-600 mb-2">PERSONNEL DOSSIER</div>
          <div className="text-6xl mb-4">{role.icon}</div>
          <h2 className="serif text-3xl gold-accent mb-2">{role.name}</h2>
          <div className="border border-gray-700 px-3 py-1 inline-block">
            <span className="typewriter text-xs">[{role.team.toUpperCase()}]</span>
          </div>
        </div>

        <div className="bg-black/40 border-l-4 border-gray-700 p-4 mb-6">
          <h3 className="typewriter text-xs gold-accent mb-2">MISSION DIRECTIVE:</h3>
          <p className="typewriter text-sm text-gray-500 leading-relaxed">
            {descriptions[roleKey] || 'Classified operative.'}
          </p>
        </div>

        {/* Bullet indicators */}
        {role.action && (
          <div className="flex justify-center gap-2 mb-6">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="w-2 h-5 bg-gradient-to-b from-gray-600 to-gray-800 rounded-full" style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }} />
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full px-6 py-4 border-2 border-gray-700 typewriter hover:bg-gray-900/50 transition-colors"
          style={{ boxShadow: '6px 6px 0 rgba(0,0,0,0.5)' }}
        >
          [ ACKNOWLEDGED ]
        </button>
      </motion.div>
    </motion.div>
  );
}

// ============================================================================
// NOTIFICATION
// ============================================================================
function Notification({ message }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50 }}
      className="fixed top-24 right-4 z-50 noir-paper border-2 border-gray-800 px-6 py-4 max-w-sm"
      style={{ boxShadow: '6px 6px 0 rgba(0,0,0,0.7)' }}
    >
      <p className="typewriter text-sm">{message}</p>
    </motion.div>
  );
}

export default MafiaGame;