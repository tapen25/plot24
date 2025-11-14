// HTMLドキュメントが読み込まれたら、コードを実行します
document.addEventListener('DOMContentLoaded', () => {

    // === 1. 基本設定（HTML要素の取得） ===
    const playPauseBtn = document.getElementById('playPauseBtn');
    const speedSelectButtons = document.querySelectorAll('.speedSelectBtn');
    
    // 【追加】センサー起動用のボタン
    const sensorStartBtn = document.getElementById('sensorStartBtn'); 

    // === 2. 複数プレイヤーの管理 ===
    const speeds = ['1.10', '1.15', '1.20', '1.25', '1.30', '1.35'];
    const wsPlayers = {};
    const currentVolumes = {};

    let masterPlayer = null;
    
    // --- ▼ 修正点 1 (基準速度を 1.10 に) ---
    let currentActiveSpeed = '1.10';
    // --- ▲ 修正点 1 ---
    
    let filesLoaded = 0;
    const totalFiles = speeds.length;
    let isCrossfading = false;
    
    // 【追加】加速度センサー関連
    let lastMagnitude = 0;
    const SMOOTHING_FACTOR_MOTION = 0.1; // スムージング係数 (0.0に近いほど敏感)
    let motionListenerAttached = false;


    // === 3. 全プレイヤーの初期化 ===
    console.log('Initializing players...');
    speeds.forEach(speed => {
        const containerId = `#waveform-${speed.replace('.', '\\.')}`; 
        
        const ws = WaveSurfer.create({
            container: containerId,
            waveColor: (speed === '1.10') ? 'violet' : 'grey', 
            progressColor: (speed === '1.10') ? 'purple' : 'grey',
            height: (speed === '1.10') ? 100 : 1, 
            interact: (speed === '1.10'),
        });

        const fileName = `kanon_${speed}x.wav`; 
        try { ws.load(fileName); } catch(e) { /* ...エラー処理... */ }

        currentVolumes[speed] = (speed === '1.10') ? 1.0 : 0.0;
        ws.setVolume(currentVolumes[speed]);
        wsPlayers[speed] = ws;

        ws.on('ready', () => {
            filesLoaded++;
            console.log(`Loaded ${fileName} (${filesLoaded}/${totalFiles})`);
            
            if (filesLoaded === totalFiles) {
                console.log('All files loaded and ready.');
                masterPlayer = wsPlayers['1.10'];
                
                // masterPlayer が undefined でないことを確認
                if (masterPlayer) {
                    setupSync(); 
                    setupMotionDetection(); // setupSync の後でも先でもOK
                    
                    playPauseBtn.disabled = false;
                    playPauseBtn.textContent = 'Play';
                    speedSelectButtons.forEach(btn => btn.disabled = false);
                } else {
                    console.error("Master player (1.10) failed to initialize. Check HTML ID and file path.");
                }
            }
        });

        ws.on('finish', () => {
            // --- ▼ 修正点 2 (マスタープレイヤーの速度 1.10 に) ---
            if (speed === '1.10') {
            // --- ▲ 修正点 2 ---
                Object.values(wsPlayers).forEach(p => p.stop());
                playPauseBtn.textContent = 'Play';
            }
        });
    });

    // === 4. 同期設定 (Progressベース) ===
    function setupSync() {
        // ... (変更なし) ...
        playPauseBtn.onclick = () => {
            masterPlayer.playPause();
        };

        masterPlayer.on('play', () => {
            playPauseBtn.textContent = 'Pause';
            const currentTime = masterPlayer.getCurrentTime();
            const duration = masterPlayer.getDuration();
            const progress = (duration > 0) ? (currentTime / duration) : 0;
            
            Object.values(wsPlayers).forEach(ws => {
                if (ws !== masterPlayer) {
                    ws.seekTo(progress); 
                    ws.play();
                }
            });
        });

        masterPlayer.on('pause', () => {
            playPauseBtn.textContent = 'Play';
            Object.values(wsPlayers).forEach(ws => ws.pause());
        });

        masterPlayer.on('seek', (progress) => {
            Object.values(wsPlayers).forEach(ws => {
                ws.seekTo(progress);
            });
        });
    }

    // === 5. 手動クロスフェード処理 (再生位置同期の追加) ===
    // ... (変更なし) ...
    const SMOOTHING_FACTOR_VOLUME = 0.04;
    function manualCrossfade(targetSpeedKey) {
        if (!wsPlayers[targetSpeedKey]) {
            console.warn(`Target speed ${targetSpeedKey} not found in wsPlayers.`);
            return;
        }
        if (isCrossfading || targetSpeedKey === currentActiveSpeed) return;
        isCrossfading = true;

        console.log(`Starting crossfade from ${currentActiveSpeed} to ${targetSpeedKey}`);

        const isPlaying = masterPlayer.isPlaying();
        const currentTime = masterPlayer.getCurrentTime();
        const duration = masterPlayer.getDuration();
        const currentProgress = (duration > 0) ? (currentTime / duration) : 0;
        
        const targetPlayer = wsPlayers[targetSpeedKey];
        targetPlayer.seekTo(currentProgress);

        if (isPlaying) {
            targetPlayer.play();
        }

        let frameId;
        const animateCrossfade = () => {
            let allFaded = true;

            speeds.forEach(speed => {
                const ws = wsPlayers[speed];
                const currentVol = currentVolumes[speed];
                const targetVol = (speed === targetSpeedKey) ? 1.0 : 0.0;

                let newVol = (targetVol * SMOOTHING_FACTOR_VOLUME) + (currentVol * (1.0 - SMOOTHING_FACTOR_VOLUME));

                if (Math.abs(newVol - targetVol) < 0.005) {
                    newVol = targetVol;
                } else {
                    allFaded = false;
                }
                currentVolumes[speed] = newVol;
                ws.setVolume(newVol);
            });

            if (!allFaded) {
                frameId = requestAnimationFrame(animateCrossfade);
            } else {
                console.log('Crossfade completed.');
                currentActiveSpeed = targetSpeedKey;
                isCrossfading = false;
            }
        };

        requestAnimationFrame(animateCrossfade);
    }
   
    // === 6. 速度切り替えボタンのイベントリスナー ===
    // (HTML側の data-speed が修正されたため、このセクションは変更不要)
    speedSelectButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetSpeed = button.dataset.speed;
            manualCrossfade(targetSpeed);

            // UIのアクティブ状態を更新
            speedSelectButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });

    // === 7. 【追加】加速度センサー処理 ===
    // ... (変更なし) ...
    function setupMotionDetection() {
        console.log('Setting up motion detection...');
        if (!sensorStartBtn) {
            console.warn('Sensor start button (#sensorStartBtn) not found.');
            return;
        }

        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            sensorStartBtn.disabled = false;
            sensorStartBtn.textContent = 'センサーを有効化';
            
            sensorStartBtn.addEventListener('click', () => {
                DeviceMotionEvent.requestPermission()
                    .then(permissionState => {
                        if (permissionState === 'granted') {
                            console.log('Motion permission granted.');
                            window.addEventListener('devicemotion', handleMotion);
                            motionListenerAttached = true;
                            sensorStartBtn.style.display = 'none';
                        } else {
                            console.warn('Motion permission denied.');
                            sensorStartBtn.textContent = '許可されませんでした';
                        }
                    })
                    .catch(e => {
                         console.error('Motion permission request failed:', e);
                         sensorStartBtn.textContent = 'センサーエラー';
                    });
            }, { once: true });

        } else if (typeof DeviceMotionEvent !== 'undefined') {
            console.log('Attempting to attach devicemotion listener (Android/standard).');
            sensorStartBtn.disabled = false;
            sensorStartBtn.textContent = 'センサーを開始';
            
            sensorStartBtn.addEventListener('click', () => {
                try {
                    window.addEventListener('devicemotion', handleMotion);
                    motionListenerAttached = true;
                    console.log('Attached devicemotion listener (standard).');
                    sensorStartBtn.style.display = 'none';
                } catch(e) {
                    console.error('Failed to attach devicemotion listener:', e);
                    sensorStartBtn.textContent = 'センサーエラー';
                }
            }, { once: true });

        } else {
            console.error('Device motion not supported on this device.');
            sensorStartBtn.textContent = 'センサー非対応';
            sensorStartBtn.disabled = true;
        }
    }

    function handleMotion(event) {
        if (!motionListenerAttached) return;
        const acc = event.acceleration; 

        if (acc.x === null || acc.y === null || acc.z === null) {
            console.warn('event.acceleration data is null.');
            return;
        }

        const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
        const smoothedMagnitude = (magnitude * SMOOTHING_FACTOR_MOTION) + (lastMagnitude * (1.0 - SMOOTHING_FACTOR_MOTION));
        lastMagnitude = smoothedMagnitude;

        checkAndSwitchSpeed(smoothedMagnitude);
    }

    function getSpeedKeyFromRMS(rms) {
        if (rms < 2) return '1.10';
        if (rms < 4) return '1.15';
        if (rms < 6) return '1.20';
        if (rms < 8) return '1.25';
        if (rms < 10) return '1.30';
        return '1.35'; // 10以上
    }

    function checkAndSwitchSpeed(rmsValue) {
        if (!masterPlayer) return; 

        const targetSpeedKey = getSpeedKeyFromRMS(rmsValue);

        if (targetSpeedKey !== currentActiveSpeed && !isCrossfading) {
            
            console.log(`Motion triggered crossfade to: ${targetSpeedKey} (RMS: ${rmsValue.toFixed(2)})`);
            
            manualCrossfade(targetSpeedKey);
            
            // HTML側の data-speed が修正されたため、ここは正しく動作する
            speedSelectButtons.forEach(btn => {
                if (btn.dataset.speed === targetSpeedKey) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    }

}); // End of DOMContentLoaded