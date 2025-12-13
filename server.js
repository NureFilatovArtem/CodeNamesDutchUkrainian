const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.static('public'));

// Load words
let allWords = [];
const wordsDir = path.join(__dirname, 'words');

try {
    const files = fs.readdirSync(wordsDir);
    files.forEach(file => {
        if (file.endsWith('.json')) {
            const content = fs.readFileSync(path.join(wordsDir, file), 'utf8');
            const words = JSON.parse(content);
            allWords = [...allWords, ...words];
        }
    });
    console.log(`Loaded ${allWords.length} words total.`);
} catch (err) {
    console.error('Error loading words:', err);
}

// Game State
const rooms = new Map();

function generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateBoard(language) {
    // Filter words by language
    const langWords = allWords.filter(w => w.type === language);

    // Shuffle and pick 25
    const shuffled = [...langWords].sort(() => 0.5 - Math.random());
    const selectedWords = shuffled.slice(0, 25);

    // Assign colors
    const startingTeam = Math.random() < 0.5 ? 'blue' : 'red';
    const secondTeam = startingTeam === 'blue' ? 'red' : 'blue';

    let colors = [
        'black',
        ...Array(9).fill(startingTeam),
        ...Array(8).fill(secondTeam),
        ...Array(7).fill('neutral')
    ];

    colors = colors.sort(() => 0.5 - Math.random());

    return {
        cards: selectedWords.map((wordObj, index) => ({
            word: wordObj.word,
            type: colors[index],
            revealed: false,
            index: index
        })),
        startingTeam,
        currentTeam: startingTeam,
        phase: 'clue', // 'clue' or 'guess'
        firstGuessTurn: true, // Special 120s timer for very first guess turn
        scores: {
            blue: startingTeam === 'blue' ? 9 : 8,
            red: startingTeam === 'red' ? 9 : 8
        },
        timers: {
            blue: 0, // 0 means untimed/clue phase
            red: 0
        },
        clueHistory: {
            blue: [],
            red: []
        },
        winner: null,
        log: []
    };
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('createRoom', ({ roomId, settings }) => {
        // Generate ID if empty
        const finalRoomId = roomId ? roomId.toUpperCase() : generateRoomId();

        if (rooms.has(finalRoomId)) {
            // Only error if user specifically requested this taken ID
            if (roomId) {
                socket.emit('error', 'Room already exists');
                return;
            } else {
                // Retry generation (simple recursion/loop, but collision unlikely for now)
                return; // TODO: handle collision retry
            }
        }

        const gameState = generateBoard(settings.gameLanguage);

        rooms.set(finalRoomId, {
            id: finalRoomId,
            players: [],
            gameState: gameState,
            settings: settings,
            traitor: null,
            timerInterval: null
        });

        socket.join(finalRoomId);
        // Add creator as HOST
        const room = rooms.get(finalRoomId);
        room.players.push({
            id: socket.id,
            name: 'Host',
            team: 'spectator',
            role: 'spectator',
            isHost: true // Explicit flag
        });

        socket.emit('roomJoined', {
            roomId: finalRoomId,
            gameState: room.gameState,
            players: room.players,
            settings: room.settings,
            gameStatus: {
                started: room.gameStarted || false,
                paused: room.isPaused || false
            }
        });
    });

    socket.on('joinRoom', ({ roomId, playerName }) => {
        const room = rooms.get(roomId ? roomId.toUpperCase() : '');
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }

        const finalRoomId = room.id;
        socket.join(finalRoomId);

        // Check if player already exists (reconnection)
        const existingPlayer = room.players.find(p => p.id === socket.id);
        if (!existingPlayer) {
            room.players.push({
                id: socket.id,
                name: playerName,
                team: 'spectator',
                role: 'spectator',
                isHost: false
            });
        } else {
            existingPlayer.name = playerName;
        }

        io.to(finalRoomId).emit('updatePlayers', room.players);
        socket.emit('roomJoined', {
            roomId: finalRoomId,
            gameState: room.gameState,
            players: room.players,
            settings: room.settings,
            gameStatus: {
                started: room.gameStarted || false,
                paused: room.isPaused || false
            }
        });
    });

    // --- Clue Management ---
    socket.on('submitClue', ({ roomId, word }) => {
        const room = rooms.get(roomId);
        if (!room || !word) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.role !== 'spymaster' || player.team !== room.gameState.currentTeam) return;

        // Add to history
        if (!room.gameState.clueHistory[player.team]) room.gameState.clueHistory[player.team] = [];
        const newClue = {
            id: Date.now().toString(),
            text: word,
            timestamp: Date.now()
        };
        room.gameState.clueHistory[player.team].push(newClue);

        io.to(roomId).emit('gameStateUpdate', room.gameState);
    });

    socket.on('editClue', ({ roomId, clueId, newText }) => {
        const room = rooms.get(roomId);
        if (!room || !newText) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.role !== 'spymaster') return;

        const teamClues = room.gameState.clueHistory[player.team];
        const clue = teamClues.find(c => c.id === clueId);
        if (clue) {
            clue.text = newText;
            io.to(roomId).emit('gameStateUpdate', room.gameState);
        }
    });

    socket.on('deleteClue', ({ roomId, clueId }) => {
        const room = rooms.get(roomId);
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.role !== 'spymaster') return;

        const teamClues = room.gameState.clueHistory[player.team];
        const index = teamClues.findIndex(c => c.id === clueId);
        if (index !== -1) {
            teamClues.splice(index, 1);
            io.to(roomId).emit('gameStateUpdate', room.gameState);
        }
    });


    socket.on('updateSettings', ({ roomId, settings }) => {
        const room = rooms.get(roomId);
        if (room) {
            // Check if requester is host? For now open.
            room.settings = settings;
            io.to(roomId).emit('settingsUpdated', settings);
        }
    });

    socket.on('startGame', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room) {
            room.gameStarted = true;
            room.isPaused = false;
            startTimerLoop(room);
            io.to(roomId).emit('gameStatusUpdate', { started: true, paused: false });
        }
    });

    socket.on('pauseGame', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room) {
            room.isPaused = !room.isPaused;
            io.to(roomId).emit('gameStatusUpdate', { started: room.gameStarted, paused: room.isPaused });
        }
    });

    socket.on('resetGame', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room) {
            room.gameState = generateBoard(room.settings.gameLanguage);
            room.gameStarted = false;
            room.isPaused = false;

            // Clear interval
            if (room.timerInterval) clearInterval(room.timerInterval);
            room.timerInterval = null;

            // Handle Traitor Mode
            if (room.settings.traitorMode && room.players.length >= 6) {
                const eligiblePlayers = room.players.filter(p => p.team === 'blue' || p.team === 'red');
                if (eligiblePlayers.length > 0) {
                    const randomPlayer = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
                    room.traitor = randomPlayer.id;
                    io.to(randomPlayer.id).emit('traitorAssigned', true);
                }
            } else {
                room.traitor = null;
            }

            io.to(roomId).emit('gameStateUpdate', room.gameState);
            io.to(roomId).emit('gameStatusUpdate', { started: false, paused: false });
        }
    });

    socket.on('switchTeam', ({ roomId, team, role }) => {
        const room = rooms.get(roomId);
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.team = team;
                player.role = role;
                io.to(roomId).emit('updatePlayers', room.players);
            }
        }
    });

    socket.on('revealCard', ({ roomId, cardIndex }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameState.winner) return;
        if (!room.gameStarted || room.isPaused) return;

        // Phase Check: Must be 'guess' phase
        if (room.gameState.phase !== 'guess') return;

        const card = room.gameState.cards[cardIndex];
        if (card.revealed) return;

        const player = room.players.find(p => p.id === socket.id);
        // Only operatives of current team can click
        if (!player || player.team !== room.gameState.currentTeam || player.role !== 'operative') return;

        card.revealed = true;

        if (card.type === 'blue') room.gameState.scores.blue--;
        if (card.type === 'red') room.gameState.scores.red--;

        // Check Win
        if (card.type === 'black') {
            room.gameState.winner = room.gameState.currentTeam === 'blue' ? 'red' : 'blue';
        } else if (room.gameState.scores.blue === 0) {
            room.gameState.winner = 'blue';
        } else if (room.gameState.scores.red === 0) {
            room.gameState.winner = 'red';
        }

        // Wrong guess Logic
        if (!room.gameState.winner && card.type !== room.gameState.currentTeam) {
            // End Turn immediately
            switchTurn(room);
        }

        io.to(roomId).emit('gameStateUpdate', room.gameState);
        io.to(roomId).emit('cardRevealed', { index: cardIndex, type: card.type });
    });

    socket.on('endTurn', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameStarted || room.isPaused) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        const isCurrentTeam = player.team === room.gameState.currentTeam;

        // Logic depends on Phase
        if (room.gameState.phase === 'clue') {
            // Only Spymaster of current team can end clue phase -> start guessing
            if (isCurrentTeam && player.role === 'spymaster') {
                room.gameState.phase = 'guess';
                // Set Timer
                const duration = (room.gameState.firstGuessTurn) ? 120 : 60;
                room.gameState.timers[room.gameState.currentTeam] = duration;
                io.to(roomId).emit('gameStateUpdate', room.gameState);
            }
        } else if (room.gameState.phase === 'guess') {
            // Team (usually operatives) can end turn to stop guessing
            // Also Captain can force end it? Assume any team member can pass
            if (isCurrentTeam) {
                switchTurn(room);
                io.to(roomId).emit('gameStateUpdate', room.gameState);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        rooms.forEach((room, roomId) => {
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                io.to(roomId).emit('updatePlayers', room.players);
            }
            if (room.players.length === 0) {
                if (room.timerInterval) clearInterval(room.timerInterval);
                rooms.delete(roomId);
            }
        });
    });

    function switchTurn(room) {
        room.gameState.currentTeam = room.gameState.currentTeam === 'blue' ? 'red' : 'blue';
        room.gameState.phase = 'clue'; // Reset to clue phase
        room.gameState.timers.blue = 0;
        room.gameState.timers.red = 0;

        // Once the first team finishes their first set of actions (Clue+Guess), firstTurn is over?
        // Actually usually strictly "First Team's First Turn" is long.
        // Let's toggle it off as soon as the starting team finishes their turn.
        if (room.gameState.currentTeam !== room.gameState.startingTeam) {
            room.gameState.firstGuessTurn = false;
        }
    }

    function startTimerLoop(room) {
        if (room.timerInterval) clearInterval(room.timerInterval);

        room.timerInterval = setInterval(() => {
            if (!room.gameStarted || room.isPaused || room.gameState.winner) return;

            // Only tick in Guess phase
            if (room.gameState.phase === 'guess') {
                const team = room.gameState.currentTeam;
                if (room.gameState.timers[team] > 0) {
                    room.gameState.timers[team]--;
                    io.to(room.id).emit('timerUpdate', room.gameState.timers);
                } else {
                    // Time expired
                    switchTurn(room);
                    io.to(room.id).emit('gameStateUpdate', room.gameState);
                }
            }
        }, 1000);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
