// ================================
// 設定定数（保守性のため独立）
// ================================
const DEFAULT_CONFIG = {
    pomodoroTime: 45,  // 45分
    shortBreakTime: 10,  // 10分
    autoStartBreaks: false,
    autoStartPomodoros: false,
};

let CONFIG = {
    FOCUS_TIME: 45 * 60,      // FOCUS時間：45分（秒単位）
    BREAK_TIME: 10 * 60,      // BREAK時間：10分（秒単位）
    autoStartBreaks: false,
    autoStartPomodoros: false,
    CHIME_FILE: 'chime.mp3',  // チャイム音声ファイル
    volume: 30,               // 音量：0-100
};

// ================================
// アプリケーション状態管理
// ================================
let state = {
    remainingTime: CONFIG.FOCUS_TIME,  // 残り時間（秒）
    isRunning: false,                  // タイマー実行中フラグ
    currentPeriod: 1,                  // 現在のセッション番号
    currentState: 'READY',            // 現在の状態：READY, FOCUS, BREAK
    timerId: null,                     // setIntervalのID
    audioInitialized: false,           // 音声コンテキスト初期化フラグ
};

// ================================
// DOM要素の取得
// ================================
const timerDisplay = document.getElementById('timer');
const periodLabel = document.getElementById('period-label');
const stateLabel = document.getElementById('state-label');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const pomodoroTimeInput = document.getElementById('pomodoro-time');
const shortBreakTimeInput = document.getElementById('short-break-time');
const autoStartBreaksInput = document.getElementById('auto-start-breaks');
const autoStartPomodorosInput = document.getElementById('auto-start-pomodoros');
const volumeInput = document.getElementById('volume');
const volumeValue = document.getElementById('volume-value');
const volumePreviewBtn = document.getElementById('volume-preview-btn');

// タスク管理関連のDOM要素
const addTaskBtn = document.getElementById('add-task-btn');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
const taskList = document.getElementById('task-list');
const taskModal = document.getElementById('task-modal');
const closeTaskModalBtn = document.getElementById('close-task-modal-btn');
const taskModalTitle = document.getElementById('task-modal-title');
const taskNameInput = document.getElementById('task-text');
const taskSessionsInput = document.getElementById('task-sessions');
const saveTaskBtn = document.getElementById('save-task-btn');
const deleteTaskBtn = document.getElementById('delete-task-btn');

// ================================
// タスク管理
// ================================

let tasks = [];
let selectedTaskId = null;
let editingTaskId = null;
let selectedTasks = new Set();

/**
 * タスクをlocalStorageから読み込む
 */
function loadTasks() {
    const savedTasks = localStorage.getItem('focusTimerTasks');
    if (savedTasks) {
        tasks = JSON.parse(savedTasks);
        renderTasks();
    }
}

/**
 * タスクをlocalStorageに保存する
 */
function saveTasks() {
    localStorage.setItem('focusTimerTasks', JSON.stringify(tasks));
}

/**
 * タスクリストを描画する
 */
function renderTasks() {
    taskList.innerHTML = '';
    
    tasks.forEach(task => {
        const taskItem = document.createElement('div');
        taskItem.className = `task-item ${selectedTaskId === task.id ? 'selected' : ''}`;
        taskItem.dataset.taskId = task.id;
        
        const isSelected = selectedTasks.has(task.id);
        
        taskItem.innerHTML = `
            <div class="task-item-left">
                <div class="task-checkbox ${isSelected ? 'checked' : ''}" data-task-id="${task.id}"></div>
                <div class="task-info">
                    <div class="task-name">${task.name}</div>
                    <div class="task-progress">${task.completedSessions}/${task.targetSessions}</div>
                </div>
            </div>
            <div class="task-item-right">
                <button class="task-menu-btn" data-task-id="${task.id}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="12" cy="5" r="1"></circle>
                        <circle cx="12" cy="19" r="1"></circle>
                    </svg>
                </button>
            </div>
        `;
        
        taskList.appendChild(taskItem);
        
        // タスク選択イベント（チェックボックス以外のクリック）
        taskItem.addEventListener('click', (e) => {
            if (!e.target.closest('.task-checkbox') && !e.target.closest('.task-menu-btn')) {
                selectTask(task.id);
            }
        });
        
        // チェックボックスイベント
        const checkbox = taskItem.querySelector('.task-checkbox');
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTaskSelection(task.id);
        });
        
        // メニューボタンイベント
        const menuBtn = taskItem.querySelector('.task-menu-btn');
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            editingTaskId = task.id;
            const currentTask = tasks.find(t => t.id === task.id);
            if (currentTask) {
                taskNameInput.value = currentTask.name;
                taskSessionsInput.value = currentTask.targetSessions;
                openTaskModal(true);
            }
        });
    });
    
    // Delete Selectedボタンの表示/非表示
    updateDeleteSelectedButton();
}

/**
 * タスクの選択状態を切り替える
 */
function toggleTaskSelection(taskId) {
    if (selectedTasks.has(taskId)) {
        selectedTasks.delete(taskId);
    } else {
        selectedTasks.add(taskId);
    }
    renderTasks();
}

/**
 * Delete Selectedボタンの表示/非表示を更新する
 */
function updateDeleteSelectedButton() {
    if (selectedTasks.size > 0) {
        deleteSelectedBtn.style.display = 'block';
    } else {
        deleteSelectedBtn.style.display = 'none';
    }
}

/**
 * 選択されたタスクを一括削除する
 */
function deleteSelectedTasks() {
    if (selectedTasks.size === 0) return;
    
    tasks = tasks.filter(task => !selectedTasks.has(task.id));
    
    // 選択中のタスクが削除された場合、選択を解除
    if (selectedTaskId && selectedTasks.has(selectedTaskId)) {
        selectedTaskId = null;
        updateStateDisplay();
    }
    
    selectedTasks.clear();
    saveTasks();
    renderTasks();
}

/**
 * タスクを追加する
 */
function addTask(name, targetSessions) {
    const newTask = {
        id: Date.now().toString(),
        name: name,
        targetSessions: targetSessions,
        completedSessions: 0,
        completed: false
    };
    
    tasks.push(newTask);
    saveTasks();
    renderTasks();
}

/**
 * タスクを編集する
 */
function editTask(id, name, targetSessions) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.name = name;
        task.targetSessions = targetSessions;
        saveTasks();
        renderTasks();
    }
}

/**
 * タスクを削除する
 */
function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    if (selectedTaskId === id) {
        selectedTaskId = null;
        updateStateDisplay();
    }
    saveTasks();
    renderTasks();
}

/**
 * タスクを選択する
 */
function selectTask(id) {
    selectedTaskId = id;
    renderTasks();
    updateStateDisplay();
}

/**
 * タスクモーダルを開く
 */
function openTaskModal(isEdit = false) {
    taskModal.classList.add('active');
    if (isEdit) {
        taskModalTitle.textContent = 'Edit Task';
        deleteTaskBtn.style.display = 'block';
    } else {
        taskModalTitle.textContent = 'Add Task';
        deleteTaskBtn.style.display = 'none';
        taskNameInput.value = '';
        taskSessionsInput.value = 1;
    }
}

/**
 * タスクモーダルを閉じる
 */
function closeTaskModal() {
    taskModal.classList.remove('active');
    editingTaskId = null;
    deleteTaskBtn.style.display = 'none';
}

// ================================
// 設定の読み込み・保存
// ================================

/**
 * localStorageから設定を読み込む
 */
function loadSettings() {
    const savedSettings = localStorage.getItem('focusTimerSettings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        CONFIG.FOCUS_TIME = settings.pomodoroTime * 60;
        CONFIG.BREAK_TIME = settings.shortBreakTime * 60;
        CONFIG.autoStartBreaks = settings.autoStartBreaks;
        CONFIG.autoStartPomodoros = settings.autoStartPomodoros;
        CONFIG.volume = settings.volume || 50;
        
        // 入力欄に値を反映
        pomodoroTimeInput.value = settings.pomodoroTime;
        shortBreakTimeInput.value = settings.shortBreakTime;
        autoStartBreaksInput.checked = settings.autoStartBreaks;
        autoStartPomodorosInput.checked = settings.autoStartPomodoros;
        volumeInput.value = CONFIG.volume;
        volumeValue.textContent = CONFIG.volume + '%';
    } else {
        // デフォルト値を入力欄に反映
        pomodoroTimeInput.value = DEFAULT_CONFIG.pomodoroTime;
        shortBreakTimeInput.value = DEFAULT_CONFIG.shortBreakTime;
        autoStartBreaksInput.checked = DEFAULT_CONFIG.autoStartBreaks;
        autoStartPomodorosInput.checked = DEFAULT_CONFIG.autoStartPomodoros;
        volumeInput.value = CONFIG.volume;
        volumeValue.textContent = CONFIG.volume + '%';
    }
}

/**
 * 設定をlocalStorageに保存する
 */
function saveSettings() {
    const settings = {
        pomodoroTime: parseInt(pomodoroTimeInput.value),
        shortBreakTime: parseInt(shortBreakTimeInput.value),
        autoStartBreaks: autoStartBreaksInput.checked,
        autoStartPomodoros: autoStartPomodorosInput.checked,
        volume: parseInt(volumeInput.value),
    };
    
    localStorage.setItem('focusTimerSettings', JSON.stringify(settings));
    
    // CONFIGを更新
    CONFIG.FOCUS_TIME = settings.pomodoroTime * 60;
    CONFIG.BREAK_TIME = settings.shortBreakTime * 60;
    CONFIG.autoStartBreaks = settings.autoStartBreaks;
    CONFIG.autoStartPomodoros = settings.autoStartPomodoros;
    CONFIG.volume = settings.volume;
    
    // タイマーが停止中の場合、残り時間を更新
    if (!state.isRunning && state.currentState === 'READY') {
        state.remainingTime = CONFIG.FOCUS_TIME;
        updateTimerDisplay();
    }
}

/**
 * 入力値の変更時に設定を保存する
 */
function handleSettingChange() {
    saveSettings();
}

// ================================
// 音声管理
// ================================
let audioElement = null;

/**
 * 音声コンテキストを初期化する
 * ブラウザの自動再生制限を回避するため、ユーザー操作時に呼び出す
 */
function initializeAudio() {
    if (state.audioInitialized) return;
    
    audioElement = new Audio(CONFIG.CHIME_FILE);
    audioElement.load();
    audioElement.volume = CONFIG.volume / 100;
    
    // 音声再生完了時のイベントリスナーを設定
    audioElement.addEventListener('ended', () => {
        // 音声再生完了時の処理（必要に応じて追加）
    });
    
    state.audioInitialized = true;
}

/**
 * チャイム音声を再生する
 */
function playChime() {
    if (audioElement && state.audioInitialized) {
        audioElement.currentTime = 0;
        audioElement.play().catch(error => {
            console.error('音声再生エラー:', error);
        });
    }
}

// ================================
// UI更新関数
// ================================

/**
 * 残り時間をMM:SS形式で表示する
 */
function updateTimerDisplay() {
    const minutes = Math.floor(state.remainingTime / 60);
    const seconds = state.remainingTime % 60;
    const formattedTime = 
        String(minutes).padStart(2, '0') + ':' + 
        String(seconds).padStart(2, '0');
    timerDisplay.textContent = formattedTime;
}

/**
 * セッション情報（Period番号）を更新する
 */
function updatePeriodDisplay() {
    const suffix = getOrdinalSuffix(state.currentPeriod);
    periodLabel.textContent = `${state.currentPeriod}${suffix} Period`;
}

/**
 * 状態（FOCUS/BREAK/READY）を更新する
 */
function updateStateDisplay() {
    if (state.currentState === 'FOCUS') {
        if (selectedTaskId) {
            const task = tasks.find(t => t.id === selectedTaskId);
            if (task) {
                const sessionInfo = `${task.completedSessions + 1}/${task.targetSessions}`;
                stateLabel.textContent = `${task.name} (${sessionInfo})`;
                return;
            }
        }
        stateLabel.textContent = 'FOCUS';
    } else if (state.currentState === 'BREAK') {
        const nextTask = getNextTask();
        if (nextTask) {
            stateLabel.textContent = `BREAK: Next → ${nextTask.name}`;
        } else {
            stateLabel.textContent = 'BREAK';
        }
    } else {
        stateLabel.textContent = state.currentState;
    }
}

/**
 * 数値に応じた序数接尾辞を返す（1st, 2nd, 3rd, 4th...）
 */
function getOrdinalSuffix(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * 全UIを更新する
 */
function updateAllDisplays() {
    updateTimerDisplay();
    updatePeriodDisplay();
    updateStateDisplay();
    updatePageTitle();
}

/**
 * ブラウザタブのタイトルを更新する
 * タイマーの状態に応じてタイトルを変更
 */
function updatePageTitle() {
    const minutes = Math.floor(state.remainingTime / 60);
    const seconds = state.remainingTime % 60;
    const formattedTime = 
        String(minutes).padStart(2, '0') + ':' + 
        String(seconds).padStart(2, '0');
    
    if (state.currentState === 'READY') {
        document.title = 'Focus Timer';
    } else if (state.currentState === 'FOCUS') {
        document.title = state.isRunning ? `Focus (${formattedTime})` : `Pause (${formattedTime})`;
    } else if (state.currentState === 'BREAK') {
        document.title = state.isRunning ? `Break (${formattedTime})` : `Pause (${formattedTime})`;
    }
}

// ================================
// タイマー制御関数
// ================================

/**
 * タイマーを開始する
 */
function startTimer() {
    // 音声コンテキストの初期化（最初のSTART時のみ）
    initializeAudio();
    
    // 既に実行中の場合は何もしない
    if (state.isRunning) return;
    
    // READY状態の場合はFOCUSから開始
    if (state.currentState === 'READY') {
        state.currentState = 'FOCUS';
        state.remainingTime = CONFIG.FOCUS_TIME;
    }
    
    state.isRunning = true;
    startBtn.textContent = 'PAUSE';
    updateStateDisplay();
    
    // 1秒ごとにタイマーを更新
    state.timerId = setInterval(() => {
        state.remainingTime--;
        updateTimerDisplay();
        updatePageTitle(); // タイトルをリアルタイム更新
        
        // タイマー終了時の処理
        if (state.remainingTime <= 0) {
            handleTimerComplete();
        }
    }, 1000);
}

/**
 * タイマーを一時停止する
 */
function pauseTimer() {
    if (!state.isRunning) return;
    
    clearInterval(state.timerId);
    state.isRunning = false;
    startBtn.textContent = 'START';
}

/**
 * タイマーをリセットする
 */
function resetTimer() {
    // タイマー停止
    clearInterval(state.timerId);
    state.isRunning = false;
    
    // 状態を初期化
    state.currentState = 'READY';
    state.remainingTime = CONFIG.FOCUS_TIME;
    state.currentPeriod = 1;
    
    // UI更新
    startBtn.textContent = 'START';
    updateAllDisplays();
}

/**
 * 全タスクが完了しているかチェックし、完了していればアプリ全体をリセットする
 * @returns {boolean} リセットが実行された場合はtrue
 */
function checkAndResetAllTasks() {
    // 登録されているタスクが1つ以上あり、すべてが完了（completed）しているか確認
    if (tasks.length > 0 && tasks.every(task => task.completed)) {
        alert("すべてのタスクが完了しました！初期状態にリセットします。");
        
        // アプリ全体の完全リセット処理
        state.isRunning = false;
        state.currentState = 'READY';
        state.currentPeriod = 1;
        state.remainingTime = CONFIG.FOCUS_TIME;
        selectedTaskId = null;
        tasks = []; // タスク配列を空に
        
        // ストレージとUIの更新
        saveTasks();
        renderTasks();
        updatePeriodDisplay();
        updateStateDisplay();
        updateTimerDisplay();
        updatePageTitle();
        return true;
    }
    return false;
}

/**
 * タイマー完了時の処理
 */
function handleTimerComplete() {
    // チャイム再生
    playChime();
    
    // 1. FOCUS終了時の処理
    if (state.currentState === 'FOCUS') {
        state.currentState = 'BREAK';
        state.remainingTime = CONFIG.BREAK_TIME;
        
        // アクティブなタスクがある場合のみ進捗を更新
        if (selectedTaskId) {
            const task = tasks.find(t => t.id === selectedTaskId);
            if (task) {
                task.completedSessions++;
                if (task.completedSessions >= task.targetSessions) {
                    task.completed = true;
                }
                saveTasks();
                renderTasks();
            }
        }
        
        // 全タスク完了チェック（リセットが入った場合はここで処理を抜ける）
        if (checkAndResetAllTasks()) return;
        
        // 次のタイマー自動開始判定
        if (CONFIG.autoStartBreaks) {
            startTimer();
        } else {
            state.isRunning = false;
        }
        
    // 2. BREAK終了時の処理
    } else if (state.currentState === 'BREAK') {
        state.currentState = 'FOCUS';
        state.currentPeriod++;
        state.remainingTime = CONFIG.FOCUS_TIME;
        updatePeriodDisplay();
        
        // アクティブなタスクがある場合のみ、次のタスクへ遷移
        if (selectedTaskId) {
            moveToNextTask();
        }
        
        // 次のタイマー自動開始判定
        if (CONFIG.autoStartPomodoros) {
            startTimer();
        } else {
            state.isRunning = false;
        }
    }
    
    // UIの一括更新
    updateStateDisplay();
    updateTimerDisplay();
    updatePageTitle();
}

/**
 * 次のタスクへ遷移する
 */
function moveToNextTask() {
    if (tasks.length === 0) return;
    
    // 現在のタスクが完了している場合、次のタスクを選択
    if (selectedTaskId) {
        const currentTask = tasks.find(t => t.id === selectedTaskId);
        if (currentTask && currentTask.completedSessions >= currentTask.targetSessions) {
            // 現在のタスクが完了している場合、次の未完了タスクを探す
            const nextTask = tasks.find(t => t.completedSessions < t.targetSessions);
            if (nextTask) {
                selectTask(nextTask.id);
            } else {
                // 全タスク完了の場合、最初のタスクに戻る
                if (tasks.length > 0) {
                    selectTask(tasks[0].id);
                }
            }
        }
    } else {
        // タスクが選択されていない場合、最初のタスクを選択
        selectTask(tasks[0].id);
    }
}

/**
 * 次のタスクを取得する
 */
function getNextTask() {
    if (tasks.length === 0) return null;
    
    // 全タスクが完了しているかチェック
    const allComplete = tasks.every(t => t.completedSessions >= t.targetSessions);
    if (allComplete) {
        return null; // 全タスク完了
    }
    
    // 現在のタスクが完了している場合、次の未完了タスクを探す
    if (selectedTaskId) {
        const currentTask = tasks.find(t => t.id === selectedTaskId);
        if (currentTask && currentTask.completedSessions >= currentTask.targetSessions) {
            const nextTask = tasks.find(t => t.completedSessions < t.targetSessions);
            return nextTask;
        }
    }
    
    // 現在のタスクが未完了の場合、それを返す
    if (selectedTaskId) {
        const currentTask = tasks.find(t => t.id === selectedTaskId);
        if (currentTask && currentTask.completedSessions < currentTask.targetSessions) {
            return currentTask;
        }
    }
    
    // タスクが選択されていない場合、最初の未完了タスクを返す
    const firstIncompleteTask = tasks.find(t => t.completedSessions < t.targetSessions);
    return firstIncompleteTask;
}

// ================================
// イベントリスナーの設定
// ================================

// START/PAUSEボタン
startBtn.addEventListener('click', () => {
    if (state.isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
});

// RESETボタン
resetBtn.addEventListener('click', resetTimer);

// ================================
// 設定モーダル制御
// ================================

/**
 * 設定モーダルを開く
 */
function openSettingsModal() {
    settingsModal.classList.add('active');
}

/**
 * 設定モーダルを閉じる
 */
function closeSettingsModal() {
    settingsModal.classList.remove('active');
}

// 設定ボタンクリック
settingsBtn.addEventListener('click', openSettingsModal);

// 閉じるボタンクリック
closeModalBtn.addEventListener('click', closeSettingsModal);

// モーダル外クリックで閉じる
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        closeSettingsModal();
    }
});

// 設定入力欄の変更イベント
pomodoroTimeInput.addEventListener('input', handleSettingChange);
shortBreakTimeInput.addEventListener('input', handleSettingChange);
autoStartBreaksInput.addEventListener('change', handleSettingChange);
autoStartPomodorosInput.addEventListener('change', handleSettingChange);

// 音量スライダーの変更イベント
volumeInput.addEventListener('input', () => {
    const volume = parseInt(volumeInput.value);
    volumeValue.textContent = volume + '%';
    CONFIG.volume = volume;
    
    // 音声要素が初期化されている場合は音量を更新
    if (audioElement && state.audioInitialized) {
        audioElement.volume = volume / 100;
    }
    
    saveSettings();
});

// 音量プレビューボタンのクリックイベント
let volumePreviewAudio = null;
let isVolumePreviewPlaying = false;

volumePreviewBtn.addEventListener('click', () => {
    if (isVolumePreviewPlaying && volumePreviewAudio) {
        // 再生中の場合は停止
        volumePreviewAudio.pause();
        volumePreviewAudio.currentTime = 0;
        isVolumePreviewPlaying = false;
        volumePreviewBtn.textContent = '🔊';
    } else {
        // 停止中の場合は再生
        if (volumePreviewAudio) {
            volumePreviewAudio.pause();
            volumePreviewAudio.currentTime = 0;
        }
        
        volumePreviewAudio = new Audio(CONFIG.CHIME_FILE);
        volumePreviewAudio.volume = CONFIG.volume / 100;
        volumePreviewAudio.play().catch(error => {
            console.error('音量プレビュー再生エラー:', error);
            isVolumePreviewPlaying = false;
            volumePreviewBtn.textContent = '🔊';
        });
        isVolumePreviewPlaying = true;
        volumePreviewBtn.textContent = '🔇';
        
        // 再生終了時にボタンをリセット
        volumePreviewAudio.addEventListener('ended', () => {
            isVolumePreviewPlaying = false;
            volumePreviewBtn.textContent = '🔊';
        }, { once: true });
    }
});

// ================================
// タスク管理イベントリスナー
// ================================

// タスク追加ボタン
addTaskBtn.addEventListener('click', () => {
    editingTaskId = null;
    openTaskModal(false);
});

// Delete Selectedボタン
deleteSelectedBtn.addEventListener('click', () => {
    if (selectedTasks.size > 0) {
        if (confirm(`Are you sure you want to delete ${selectedTasks.size} task(s)?`)) {
            deleteSelectedTasks();
        }
    }
});

// タスクモーダルを閉じる
closeTaskModalBtn.addEventListener('click', closeTaskModal);

// タスク保存ボタン
saveTaskBtn.addEventListener('click', () => {
    const name = taskNameInput.value.trim();
    const sessions = parseInt(taskSessionsInput.value);
    
    if (!name) {
        alert('Please enter a task name');
        return;
    }
    
    if (editingTaskId) {
        editTask(editingTaskId, name, sessions);
    } else {
        addTask(name, sessions);
    }
    
    closeTaskModal();
});

// タスクモーダル外クリックで閉じる
taskModal.addEventListener('click', (e) => {
    if (e.target === taskModal) {
        closeTaskModal();
    }
});

// タスク削除ボタン
deleteTaskBtn.addEventListener('click', () => {
    if (editingTaskId) {
        deleteTask(editingTaskId);
    }
    closeTaskModal();
});

// ================================
// 初期化
// ================================

// 設定を読み込む
loadSettings();

// タスクを読み込む
loadTasks();

// アプリ起動時の初期表示
updateAllDisplays();
