// ================================
// 設定定数（保守性のため独立）
// ================================
const CONFIG = {
    FOCUS_TIME: 45 * 60,      // FOCUS時間：45分（秒単位）
    BREAK_TIME: 10 * 60,      // BREAK時間：10分（秒単位）
    CHIME_FILE: 'chime.mp3',  // チャイム音声ファイル
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
    isVolumeTestPlaying: false,        // 音量テスト再生中フラグ
};

// ================================
// DOM要素の取得
// ================================
const timerDisplay = document.getElementById('timer');
const periodLabel = document.getElementById('period-label');
const stateLabel = document.getElementById('state-label');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const volumeBtn = document.getElementById('volume-btn');

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
    
    // 音声再生完了時のイベントリスナーを設定
    audioElement.addEventListener('ended', () => {
        state.isVolumeTestPlaying = false;
        volumeBtn.textContent = '🔊 音量確認';
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
    stateLabel.textContent = state.currentState;
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
 * タイマー動作中は「残り時間 [分:秒] - FOCUS/BREAK」を表示
 */
function updatePageTitle() {
    const minutes = Math.floor(state.remainingTime / 60);
    const seconds = state.remainingTime % 60;
    const formattedTime = 
        String(minutes).padStart(2, '0') + ':' + 
        String(seconds).padStart(2, '0');
    
    if (state.currentState === 'READY') {
        document.title = 'Chime Timer';
    } else {
        document.title = `${formattedTime} - ${state.currentState}`;
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
 * タイマー完了時の処理
 * FOCUS→BREAK、BREAK→FOCUSを自動的に切り替える
 */
function handleTimerComplete() {
    // タイマー停止
    clearInterval(state.timerId);
    state.isRunning = false;
    
    // チャイム再生
    playChime();
    
    // 状態切り替え
    if (state.currentState === 'FOCUS') {
        // FOCUS終了 → BREAK開始
        state.currentState = 'BREAK';
        state.remainingTime = CONFIG.BREAK_TIME;
    } else if (state.currentState === 'BREAK') {
        // BREAK終了 → 次のFOCUS開始
        state.currentState = 'FOCUS';
        state.currentPeriod++;
        state.remainingTime = CONFIG.FOCUS_TIME;
        updatePeriodDisplay();
    }
    
    // UI更新
    startBtn.textContent = 'START';
    updateStateDisplay();
    updateTimerDisplay();
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

// 音量確認ボタン
volumeBtn.addEventListener('click', () => {
    // 音声コンテキストの初期化
    initializeAudio();
    
    if (state.isVolumeTestPlaying) {
        // 再生中の場合は停止
        audioElement.pause();
        audioElement.currentTime = 0;
        state.isVolumeTestPlaying = false;
        volumeBtn.textContent = '🔊 音量確認';
    } else {
        // 停止中の場合は再生
        audioElement.currentTime = 0;
        audioElement.play().catch(error => {
            console.error('音声再生エラー:', error);
        });
        state.isVolumeTestPlaying = true;
        volumeBtn.textContent = '🔊 停止';
    }
});

// ================================
// 初期化
// ================================

// アプリ起動時の初期表示
updateAllDisplays();
