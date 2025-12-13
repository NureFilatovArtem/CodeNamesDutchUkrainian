const socket = io();

// State
let currentRoomId = null;
let playerRole = 'spectator';
let playerTeam = 'spectator';
let isSpymasterMode = false;
let interfaceLanguage = 'ukrainian';
let isHost = false;
let isGamePaused = false;
let isGameStarted = false;

// --- Timer Sounds ---
const tickingAudio = new Audio('sounds/a-kitchen-timer-55420.mp3');
const terminerAudio = new Audio('sounds/timer-terminer-342934.mp3');
tickingAudio.preload = 'auto';
terminerAudio.preload = 'auto';
let tickingStopTimeout = null;
let lastTimersSnapshot = { blue: null, red: null };
let lastActiveTeamForSounds = null;
let wasPausedWhileTicking = false;

// DOM Elements
const screens = {
    login: document.getElementById('login-screen'),
    game: document.getElementById('game-screen')
};

const inputs = {
    username: document.getElementById('username-input'),
    room: document.getElementById('room-input')
};

const gameElements = {
    grid: document.getElementById('game-grid'),
    scoreBlue: document.getElementById('score-blue'),
    scoreRed: document.getElementById('score-red'),
    timerBlue: document.getElementById('timer-blue'),
    timerRed: document.getElementById('timer-red'),
    listBlue: document.getElementById('list-blue'),
    listRed: document.getElementById('list-red'),
    listSpectators: document.getElementById('spectators-list'),
    spymasterToggle: document.getElementById('spymaster-toggle'),
    adminControls: document.getElementById('admin-controls'),
    spymasterControls: document.getElementById('spymaster-controls'),
    endTurnBtn: document.getElementById('end-turn-btn'),

    // Updated Clue Elements
    clueListBlue: document.getElementById('clue-list-blue'),
    clueListRed: document.getElementById('clue-list-red'),
    cluePhaseBlue: document.getElementById('clue-phase-blue'),
    cluePhaseRed: document.getElementById('clue-phase-red'),
    clueInputBlue: document.getElementById('clue-input-blue'),
    clueInputRed: document.getElementById('clue-input-red'),
    clueSubmitBlue: document.getElementById('clue-submit-blue'),
    clueSubmitRed: document.getElementById('clue-submit-red')
};

// Translations
const translations = {
    dutch: {
        name: "Jouw Naam",
        room: "Kamer Code",
        create: "Maak Kamer",
        join: "Doe Mee",
        spymasterView: "👁️ Spionnenmeester Zicht",
        endTurn: "Beurt Eindigen", // Generic fallback
        startTimer: "Start Timer",
        reset: "Nieuw Spel",
        settings: "Instellingen",
        joinBtn: "Doe Mee",
        captainBtn: "Kapitein",
        startGame: "Start Spel",
        pauseGame: "Pauze",
        resumeGame: "Hervatten",
        cluesTitle: "Hints Geschiedenis",
        cluePlaceholder: "Nieuwe hint...",
        phaseClue: "HINT FASE",
        phaseGuess: "RAAD FASE",
        waiting: "Wachten...",
        submit: "Verstuur"
    },
    ukrainian: {
        name: "Ваше Ім'я",
        room: "Код Кімнати",
        create: "Створити",
        join: "Приєднатися",
        spymasterView: "👁️ Вигляд Капітана",
        endTurn: "Закінчити Хід",
        startTimer: "Запустити Таймер",
        reset: "Нова Гра",
        settings: "Налаштування",
        joinBtn: "Приєднатися",
        captainBtn: "Капітан",
        startGame: "Почати Гру",
        pauseGame: "Пауза",
        resumeGame: "Продовжити",
        cluesTitle: "Історія Підказок",
        cluePlaceholder: "Нова підказка...",
        phaseClue: "ФАЗА ПІДКАЗОК",
        phaseGuess: "ФАЗА ВІДГАДУВАННЯ",
        waiting: "Очікуємо...",
        submit: "Надіслати"
    }
};

// --- Helper Functions ---
function getTranslation() {
    return translations[interfaceLanguage] || translations.ukrainian;
}

// --- Event Listeners ---

window.addEventListener('load', () => {
    // 1. URL Params (?room=XYZ)
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        inputs.room.value = roomParam;
    }

    // 2. Session Recover
    const savedRoom = sessionStorage.getItem('codenames_room');
    const savedName = sessionStorage.getItem('codenames_name');

    if (savedRoom && savedName) {
        // If URL has different room, prefer URL and don't auto-join yet (user should confirm)
        if (roomParam && roomParam !== savedRoom) {
            inputs.username.value = savedName;
            // Let user click join
        } else {
            inputs.username.value = savedName;
            inputs.room.value = savedRoom;
            // Auto-join
            socket.emit('joinRoom', { roomId: savedRoom, playerName: savedName });
        }
    } else if (roomParam) {
        // Just prefill
    }
});

document.getElementById('create-btn').addEventListener('click', () => {
    const name = inputs.username.value || 'Player';
    const room = inputs.room.value.trim(); // Can be empty

    sessionStorage.setItem('codenames_name', name);
    // If room is empty, we will set session after we get roomJoined event

    socket.emit('createRoom', {
        roomId: room,
        settings: {
            gameLanguage: 'dutch',
            traitorMode: false
        }
    });
});

document.getElementById('join-btn').addEventListener('click', () => {
    const name = inputs.username.value || 'Player';
    const room = inputs.room.value.trim();
    if (!room) return alert('Please enter a room code');

    sessionStorage.setItem('codenames_room', room);
    sessionStorage.setItem('codenames_name', name);

    socket.emit('joinRoom', { roomId: room, playerName: name });
});

document.getElementById('spymaster-toggle').addEventListener('click', () => {
    isSpymasterMode = !isSpymasterMode;
    renderBoard(lastGameState);
    const btn = document.getElementById('spymaster-toggle');
    btn.classList.toggle('warning');
    btn.classList.toggle('secondary');
});

// "End Turn" button is context-sensitive now
document.getElementById('end-turn-btn').addEventListener('click', () => {
    socket.emit('endTurn', { roomId: currentRoomId });
});

// Clue Inputs
function wireClueInput(team) {
    const input = team === 'blue' ? gameElements.clueInputBlue : gameElements.clueInputRed;
    const submitBtn = team === 'blue' ? gameElements.clueSubmitBlue : gameElements.clueSubmitRed;

    if (!input || !submitBtn) return;

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitClue(team);
        }
    });

    submitBtn.addEventListener('click', () => submitClue(team));
}

function submitClue(team) {
    const input = team === 'blue' ? gameElements.clueInputBlue : gameElements.clueInputRed;
    const value = input.value.trim();
    if (!value) return;
    socket.emit('submitClue', { roomId: currentRoomId, word: value });
    input.value = '';
}

wireClueInput('blue');
wireClueInput('red');

// --- Control Buttons ---
document.getElementById('start-game-btn').addEventListener('click', () => {
    socket.emit('startGame', { roomId: currentRoomId });
});

document.getElementById('pause-game-btn').addEventListener('click', () => {
    socket.emit('pauseGame', { roomId: currentRoomId });
});

document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.remove('hidden');
});

document.getElementById('close-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('hidden');
});

document.getElementById('reset-game-btn').addEventListener('click', () => {
    if (confirm('Are you sure you want to start a new game?')) {
        socket.emit('resetGame', { roomId: currentRoomId });
        document.getElementById('settings-modal').classList.add('hidden');
    }
});

// Settings Toggles
document.querySelectorAll('.setting-item .toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const parent = e.target.parentElement;
        if (e.target.dataset.lang) {
            interfaceLanguage = e.target.dataset.lang;
            updateInterfaceLanguage();
            parent.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        }
    });
});

window.setGameLanguage = (lang) => {
    socket.emit('updateSettings', {
        roomId: currentRoomId,
        settings: { ...lastSettings, gameLanguage: lang }
    });
};

document.getElementById('traitor-toggle').addEventListener('change', (e) => {
    socket.emit('updateSettings', {
        roomId: currentRoomId,
        settings: { ...lastSettings, traitorMode: e.target.checked }
    });
});

// --- Socket Events ---

let lastGameState = null;
let lastSettings = null;
let lastPlayers = [];

socket.on('roomJoined', ({ roomId, gameState, players, settings, gameStatus }) => {
    currentRoomId = roomId;
    lastGameState = gameState;
    lastSettings = settings;
    lastPlayers = players;

    if (gameStatus) {
        isGameStarted = gameStatus.started;
        isGamePaused = gameStatus.paused;
    }

    // Update session with actual Room ID (in case we generated one)
    sessionStorage.setItem('codenames_room', roomId);
    inputs.room.value = roomId;

    // Update URL history for easy sharing
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?room=' + roomId;
    window.history.pushState({ path: newUrl }, '', newUrl);

    // Host Check (Anyone with isHost flag, or fallback)
    const myPlayer = players.find(p => p.id === socket.id);
    if (myPlayer) {
        isHost = myPlayer.isHost;
        playerRole = myPlayer.role;
        playerTeam = myPlayer.team;
    }

    screens.login.classList.remove('active');
    screens.game.classList.add('active');

    renderBoard(gameState);
    updateScore(gameState);
    renderPlayers(players);
    updateSettingsUI(settings);
    updateAdminControls();
    renderClues(gameState);
    updateControlsState(gameState);

    // Auto-spymaster view if role is spymaster
    if (playerRole === 'spymaster') {
        isSpymasterMode = true;
        gameElements.spymasterControls.classList.remove('hidden');
    } else {
        isSpymasterMode = false;
        gameElements.spymasterControls.classList.add('hidden');
    }
});

socket.on('updatePlayers', (players) => {
    lastPlayers = players;

    // Update my role/team
    const myPlayer = players.find(p => p.id === socket.id);
    if (myPlayer) {
        playerRole = myPlayer.role;
        playerTeam = myPlayer.team;
    }

    renderPlayers(players);
    updateControlsState(lastGameState);
});

socket.on('gameStateUpdate', (gameState) => {
    lastGameState = gameState;
    renderBoard(gameState);
    updateScore(gameState);
    updateTimers(gameState.timers);
    renderClues(gameState);
    updateControlsState(gameState);
});

socket.on('timerUpdate', (timers) => {
    if (lastGameState) lastGameState.timers = timers;
    updateTimers(timers);
});

socket.on('gameStatusUpdate', ({ started, paused }) => {
    isGameStarted = started;
    isGamePaused = paused;

    const startBtn = document.getElementById('start-game-btn');
    const pauseBtn = document.getElementById('pause-game-btn');

    if (started) {
        startBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
    } else {
        startBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
    }

    const t = getTranslation();
    pauseBtn.textContent = paused ? t.resumeGame : t.pauseGame;

    if (paused) {
        gameElements.grid.style.opacity = '0.5';
        wasPausedWhileTicking = wasPausedWhileTicking || isTickingActive();
        stopTimerSounds();
    } else {
        gameElements.grid.style.opacity = '1';
        if (wasPausedWhileTicking && lastGameState && lastGameState.timers) {
            // Resume sound logic best effort
        }
        wasPausedWhileTicking = false;
    }

    updateControlsState(lastGameState);
});

socket.on('settingsUpdated', (settings) => {
    lastSettings = settings;
    updateSettingsUI(settings);
});

socket.on('error', (msg) => {
    alert(msg);
});

// --- Rendering ---

function renderBoard(gameState) {
    const grid = gameElements.grid;
    grid.innerHTML = '';

    if (!gameState) return;

    gameState.cards.forEach((card, index) => {
        const el = document.createElement('div');
        el.className = `card ${card.revealed ? 'revealed ' + card.type : ''}`;

        // Spymaster view logic
        if (isSpymasterMode && !card.revealed) {
            el.classList.add('spymaster-view');
            el.classList.add(card.type);
        }

        el.innerHTML = `<span class="card-word">${card.word}</span>`;

        el.addEventListener('click', () => {
            socket.emit('revealCard', { roomId: currentRoomId, cardIndex: index });
        });

        grid.appendChild(el);
    });
}

function renderClues(gameState) {
    if (!gameState) return;
    const history = gameState.clueHistory || { blue: [], red: [] };
    const t = getTranslation();

    // Render Lists
    renderTeamClues('blue', history.blue, gameState.currentTeam, gameState.phase);
    renderTeamClues('red', history.red, gameState.currentTeam, gameState.phase);

    // Update Phase Titles
    const isBlueActive = gameState.currentTeam === 'blue';
    const isRedActive = gameState.currentTeam === 'red';

    const bluePhaseText = isBlueActive ? (gameState.phase === 'clue' ? t.phaseClue : t.phaseGuess) : t.waiting;
    const redPhaseText = isRedActive ? (gameState.phase === 'clue' ? t.phaseClue : t.phaseGuess) : t.waiting;

    if (gameElements.cluePhaseBlue) gameElements.cluePhaseBlue.textContent = bluePhaseText;
    if (gameElements.cluePhaseRed) gameElements.cluePhaseRed.textContent = redPhaseText;

    // Highlight active panel?
    document.querySelector('.blue-panel').classList.toggle('active-turn', isBlueActive);
    document.querySelector('.red-panel').classList.toggle('active-turn', isRedActive);
}

function renderTeamClues(team, clues, currentTeam, phase) {
    const list = team === 'blue' ? gameElements.clueListBlue : gameElements.clueListRed;
    list.innerHTML = '';

    if (!clues) return;

    // Show latest first
    // clues.slice().reverse().forEach(clue => { ... }) 
    // Actually typically old to new is better for history reading
    clues.forEach(clue => {
        const item = document.createElement('div');
        item.className = 'clue-item';

        const textSpan = document.createElement('span');
        textSpan.className = 'clue-text';
        textSpan.textContent = clue.text;
        item.appendChild(textSpan);

        // Edit Controls (Only for MY team spymaster)
        if (playerRole === 'spymaster' && playerTeam === team) {
            const editBtn = document.createElement('button');
            editBtn.className = 'icon-btn-small';
            editBtn.innerHTML = '✏️';
            editBtn.onclick = () => {
                const newText = prompt('Edit clue:', clue.text);
                if (newText) {
                    socket.emit('editClue', { roomId: currentRoomId, clueId: clue.id, newText });
                }
            };
            item.appendChild(editBtn);
        }

        list.appendChild(item);
    });

    // Scroll to bottom
    list.scrollTop = list.scrollHeight;
}

function updateControlsState(gameState) {
    if (!gameState || !isGameStarted || isGamePaused) {
        // Disable most things
        setClueInputState('blue', false);
        setClueInputState('red', false);
        gameElements.endTurnBtn.classList.add('hidden'); // or disabled
        return;
    }

    const t = getTranslation();
    const isMyTurn = playerTeam === gameState.currentTeam;

    // Clue Inputs: Only active for Spymaster of Current Team in Clue Phase
    const blueActive = gameState.currentTeam === 'blue' && gameState.phase === 'clue';
    const redActive = gameState.currentTeam === 'red' && gameState.phase === 'clue';

    setClueInputState('blue', blueActive && playerRole === 'spymaster' && playerTeam === 'blue');
    setClueInputState('red', redActive && playerRole === 'spymaster' && playerTeam === 'red');

    // End Turn Button Logic
    const btn = gameElements.endTurnBtn;
    if (isMyTurn) {
        if (playerRole === 'spymaster' && gameState.phase === 'clue') {
            btn.textContent = t.startTimer;
            btn.classList.remove('hidden', 'btn-danger');
            btn.classList.add('btn-primary'); // Green/Blue for "Start"
            btn.disabled = false;
        } else if (gameState.phase === 'guess') {
            btn.textContent = t.endTurn;
            btn.classList.remove('hidden', 'btn-primary');
            btn.classList.add('btn-danger'); // Red for "Stop"
            btn.disabled = false;
        } else {
            btn.classList.add('hidden');
        }
    } else {
        btn.classList.add('hidden');
    }
}

function setClueInputState(team, enabled) {
    const input = team === 'blue' ? gameElements.clueInputBlue : gameElements.clueInputRed;
    const btn = team === 'blue' ? gameElements.clueSubmitBlue : gameElements.clueSubmitRed;
    if (input) input.disabled = !enabled;
    if (btn) btn.disabled = !enabled;
}

function updateScore(gameState) {
    gameElements.scoreBlue.textContent = gameState.scores.blue;
    gameElements.scoreRed.textContent = gameState.scores.red;
}

function updateTimers(timers) {
    handleTimerSounds(timers);
    gameElements.timerBlue.textContent = (timers.blue > 0 ? timers.blue : '-');
    gameElements.timerRed.textContent = (timers.red > 0 ? timers.red : '-');
}

function renderPlayers(players) {
    gameElements.listBlue.innerHTML = '';
    gameElements.listRed.innerHTML = '';
    gameElements.listSpectators.innerHTML = '';

    players.forEach(p => {
        const el = document.createElement('div');
        el.textContent = p.name;

        let classes = 'player-item';
        if (p.role === 'spymaster') classes += ' spymaster';
        if (p.isHost) classes += ' host';

        el.className = classes;

        if (p.team === 'blue') {
            gameElements.listBlue.appendChild(el);
        } else if (p.team === 'red') {
            gameElements.listRed.appendChild(el);
        } else {
            el.className = 'spectator-tag';
            gameElements.listSpectators.appendChild(el);
        }
    });
}

function updateSettingsUI(settings) {
    // Visually update buttons
    const langBtns = document.querySelectorAll('.setting-item:nth-child(2) .toggle-btn');
    langBtns.forEach(btn => {
        if (btn.textContent.toLowerCase().includes(settings.gameLanguage)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    document.getElementById('traitor-toggle').checked = settings.traitorMode;
}

function updateInterfaceLanguage() {
    const t = getTranslation();
    document.querySelector('label[data-i18n="name"]').textContent = t.name;
    document.querySelector('label[data-i18n="room"]').textContent = t.room;
    document.getElementById('create-btn').textContent = t.create;
    document.getElementById('join-btn').textContent = t.join;
    document.getElementById('spymaster-toggle').textContent = t.spymasterView;
    document.getElementById('reset-game-btn').textContent = t.reset;
    document.getElementById('start-game-btn').textContent = t.startGame;

    document.querySelectorAll('.join-btn').forEach(b => b.textContent = t.joinBtn);
    document.querySelectorAll('.spymaster-btn').forEach(b => b.textContent = t.captainBtn);

    document.querySelectorAll('[data-i18n="cluesTitle"]').forEach(el => el.textContent = t.cluesTitle);
    document.querySelectorAll('[data-i18n="submit"]').forEach(el => el.textContent = t.submit);
    document.querySelectorAll('.clue-input').forEach(el => el.setAttribute('placeholder', t.cluePlaceholder));

    renderClues(lastGameState);
    updateControlsState(lastGameState);
}

function updateAdminControls() {
    // Always visible to everyone as requested
    gameElements.adminControls.classList.remove('hidden');
}

// --- Logic Helpers ---

window.joinTeam = (team) => {
    playerTeam = team;
    playerRole = 'operative';
    socket.emit('switchTeam', { roomId: currentRoomId, team, role: playerRole });
    isSpymasterMode = false;
    gameElements.spymasterControls.classList.add('hidden');
    if (lastGameState) renderBoard(lastGameState);
};

window.becomeSpymaster = (team) => {
    playerTeam = team;
    playerRole = 'spymaster';
    socket.emit('switchTeam', { roomId: currentRoomId, team, role: playerRole });
    // Show toggle but force view too
    gameElements.spymasterControls.classList.remove('hidden');
    isSpymasterMode = true;
    renderBoard(lastGameState);
};

// --- Audio ---
function safePlay(audio) {
    try {
        const p = audio.play();
        if (p && typeof p.catch === 'function') p.catch(() => { });
    } catch (_) { }
}

function stopTimerSounds() {
    if (tickingStopTimeout) {
        clearTimeout(tickingStopTimeout);
        tickingStopTimeout = null;
    }
    try {
        tickingAudio.pause(); tickingAudio.currentTime = 0;
        terminerAudio.pause(); terminerAudio.currentTime = 0;
    } catch (_) { }
}

function isTickingActive() {
    return !tickingAudio.paused && tickingAudio.currentTime > 0;
}

function startTickingForMs(ms) {
    if (!ms || ms <= 0) return;
    try { tickingAudio.currentTime = 0; } catch (_) { }
    safePlay(tickingAudio);
    if (tickingStopTimeout) clearTimeout(tickingStopTimeout);
    tickingStopTimeout = setTimeout(() => {
        try { tickingAudio.pause(); tickingAudio.currentTime = 0; } catch (_) { }
        tickingStopTimeout = null;
    }, ms);
}

function handleTimerSounds(timers) {
    if (!timers || !lastGameState || !lastGameState.currentTeam) return;
    if (!isGameStarted || isGamePaused) return;

    // Only play sounds during Guess phase
    if (lastGameState.phase !== 'guess') {
        stopTimerSounds();
        return;
    }

    const team = lastGameState.currentTeam;
    const currentVal = Number(timers[team]);
    const prevVal = Number(lastTimersSnapshot[team]);

    if (lastActiveTeamForSounds && lastActiveTeamForSounds !== team) {
        stopTimerSounds();
    }

    if (Number.isFinite(currentVal)) {
        // Start ticking if we just started a turn (val is high)
        // 120s: First phase of long turn
        // 60s: Second phase (or standard turn), restart sound
        const isStart = (currentVal === 120) || (currentVal === 60 && prevVal !== 60);

        if (isStart) {
            stopTimerSounds();
            startTickingForMs(currentVal * 1000);
        }

        if (currentVal <= 0) stopTimerSounds();
    }

    lastActiveTeamForSounds = team;
    lastTimersSnapshot = { blue: Number(timers.blue), red: Number(timers.red) };
}

window.addEventListener('pointerdown', () => {
    try { tickingAudio.volume = 0; terminerAudio.volume = 0; } catch (_) { }
    safePlay(tickingAudio);
    safePlay(terminerAudio);
    setTimeout(() => {
        try {
            tickingAudio.pause(); tickingAudio.currentTime = 0;
            terminerAudio.pause(); terminerAudio.currentTime = 0;
            tickingAudio.volume = 1; terminerAudio.volume = 1;
        } catch (_) { }
    }, 50);
}, { once: true });
