// Get references to all important DOM elements
const startBtn = document.getElementById("startBtn");       // Start recording button
const stopBtn = document.getElementById("stopBtn");         // Stop recording button
const resetBtn = document.getElementById("resetBtn");       // Reset app button
const transcriptBox = document.getElementById("transcript"); // Text area to display transcription
const loader = document.getElementById("loader");           // Loader animation while transcribing
const copyBtn = document.getElementById("copyBtn");         // Copy transcription button
const downloadBtn = document.getElementById("downloadBtn"); // Download transcription button
const toastContainer = document.getElementById("toast-container"); // Toast notifications container
const canvas = document.getElementById("waveform");         // Canvas for audio waveform
const recordingTimer = document.getElementById("recordingTimer"); // Timer display
const audioPlayback = document.getElementById("audioPlayback");   // Audio playback element
const ctx = canvas.getContext("2d");                        // Canvas 2D context

// Settings modal elements
const settingsBtn = document.getElementById("settingsBtn");   // Open settings modal button
const settingsModal = document.getElementById("settingsModal"); // Settings modal container
const closeSettings = document.getElementById("closeSettings"); // Close modal button
const soundToggle = document.getElementById("soundToggle");     // Sound on/off toggle
const themeToggle = document.getElementById("themeToggle");     // Dark/light mode toggle
const toastPositionSelect = document.getElementById("toastPosition"); // Toast position selector

// Preload notification sounds
const soundFiles = {
    success: "/static/sounds/success.mp3",
    error:   "/static/sounds/error.mp3",
    info:    "/static/sounds/info.mp3",
    warning: "/static/sounds/warning.mp3"
};

// Variables to manage recording, waveform, timer, track transcription and settings
let recorder, audioChunks = [];
let audioContext, analyser, dataArray, source, animationId;
let timerInterval, startTime;
let soundEnabled = true;
let toastLimit = 4; // Maximum number of visible toasts
let currentTranscriptionRequest = null; // Track current transcription

// Play a notification sound based on type (success, error, info, warning)
function playSound(type) {
    if (!soundEnabled) {
      return; // Skip if sound is disabled
    } 
    
    const src = soundFiles[type] || soundFiles.info;
    const audio = new Audio(src);
    audio.volume = 0.5;
    audio.play().catch(() => console.warn("Failed to play sound:", src));
}

// Display a toast notification
function showToast(msg, type = "info") {
    const icons = { 
      // Icon for each type
      success: '<i class="fas fa-check-circle"></i>',
      error:   '<i class="fas fa-times-circle"></i>',
      info:    '<i class="fas fa-info-circle"></i>',
      warning: '<i class="fas fa-exclamation-triangle"></i>'
    };

    // Remove oldest toast if too many
    while (toastContainer.children.length >= toastLimit) {
        toastContainer.children[0].remove();
    }

    // Create toast element
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `${icons[type]} <span>${msg}</span><button class="toast-close">&times;</button>`;

    // Close button for toast
    toast.querySelector(".toast-close").onclick = () => toast.remove();

    // Add to container and play sound
    toastContainer.appendChild(toast);
    playSound(type);

    // Automatically remove after 3 seconds
    setTimeout(() => toast.remove(), 3000);
}

// Open modal
settingsBtn.onclick = () => {
  settingsModal.classList.add("show");  // trigger CSS animation (e.g., fade-in)
  settingsModal.style.display = "flex"; // make modal visible
};

// Close modal via X button
closeSettings.onclick = () => {
  settingsModal.classList.remove("show"); // trigger fade-out animation
  setTimeout(() => settingsModal.style.display = "none", 250); // hide after animation ends
};

// Close modal by clicking outside content
settingsModal.onclick = (e) => {
  if (e.target === settingsModal) {              
    // only if clicked on overlay
    settingsModal.classList.remove("show");     
    setTimeout(() => settingsModal.style.display = "none", 250);
  }
};

// Toggle sound on/off
soundToggle.onchange = () => {
  soundEnabled = soundToggle.checked;
  showToast("Sound " + (soundEnabled ? "enabled" : "disabled"), "info");
};

// Toggle dark/light theme
themeToggle.onchange = () => {
  document.body.className = themeToggle.checked ? "dark" : "light";
};

// Change toast position
toastPositionSelect.onchange = () => {
  toastContainer.className = toastPositionSelect.value;
  showToast("Toast position updated", "success");
};

// Waveform Gradient & Drawing
function drawWaveform() {
    // Continuously call drawWaveform using requestAnimationFrame for smooth animation
    animationId = requestAnimationFrame(drawWaveform);

    // Get current waveform data from analyser
    analyser.getByteTimeDomainData(dataArray);

    // Clear canvas for new frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Optional: light semi-transparent background
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 3; // Thickness of waveform line
    const sliceWidth = canvas.width / dataArray.length; // Horizontal step per data point
    let x = 0;

    // Gradient for waveform line (color changes from left to right)
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, "#ff6ec7");   // Start color
    gradient.addColorStop(0.5, "#42a5f5"); // Middle color
    gradient.addColorStop(1, "#ab47bc");   // End color
    ctx.strokeStyle = gradient;

    ctx.beginPath(); // Start drawing path

    for (let i = 0; i < dataArray.length; i++) {
        // Normalize byte data (0-255) to 0-2 range
        const v = dataArray[i] / 128.0;
        // Map normalized value to canvas height
        const y = v * canvas.height / 2;

        // Move to first point, then draw lines
        if (i === 0) {
           ctx.moveTo(x, y);
        } 
        else {
           ctx.lineTo(x, y);
        } 

        x += sliceWidth; // Increment horizontal position
    }

    ctx.stroke(); // Render the waveform line
}

// Recording logic
// When the START button is clicked, begin recording audio
startBtn.onclick = async () => {
    audioChunks = [];

    // Hide previous audio playback when starting new recording
    audioPlayback.src = "";
    audioPlayback.style.display = "none";

    // Hide transcription box if needed
    transcriptBox.value = "";

    if (loader) {
        loader.style.display = "none"; // Reset loader on new recording
    } 

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorder = new MediaRecorder(stream);

        recorder.ondataavailable = e => audioChunks.push(e.data);

        recorder.onstop = async () => {
            setTimeout(async () => {
                canvas.classList.remove("show");
                cancelAnimationFrame(animationId);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                clearInterval(timerInterval);
                recordingTimer.textContent = "00:00";
                recordingTimer.style.display = "none";

                if (!audioChunks.length) {
                    showToast("No audio captured!", "error");

                    if (loader) {
                        loader.style.display = "none";
                    } 
                    return;
                }

                const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
                const audioUrl = URL.createObjectURL(audioBlob);

                audioPlayback.src = audioUrl;
                audioPlayback.style.display = "block";
                transcriptBox.value = "";

                downloadBtn.onclick = () => {
                    const a = document.createElement("a");
                    a.href = audioUrl;
                    a.download = "recording.webm";
                    a.click();
                };

                // Show loader for this transcription 
                if (loader) {
                    loader.style.display = "flex";
                } 

                // Track this request
                const transcriptionRequest = (currentTranscriptionRequest = fetchTranscription(audioBlob));
                try {
                    const text = await transcriptionRequest;
                    // Only show result if this is the latest request
                    if (currentTranscriptionRequest === transcriptionRequest) {
                        transcriptBox.value = text;
                        showToast("Transcription completed!", "success");
                    }
                } catch (err) {
                    if (currentTranscriptionRequest === transcriptionRequest) {
                        console.error(err);
                        showToast("Failed to transcribe audio.", "error");
                    }
                } finally {
                    // Only hide loader if this is the latest request
                    if (currentTranscriptionRequest === transcriptionRequest && loader) {
                        loader.style.display = "none";
                    }
                }

            }, 150);
        };

        // Setup waveform
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        dataArray = new Uint8Array(analyser.fftSize);
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        canvas.style.display = "block";
        canvas.classList.add("show");
        drawWaveform();

        recorder.start();
        recordingTimer.style.display = "block";
        startBtn.style.display = "none";
        stopBtn.style.display = "inline-flex";

        startTime = Date.now();
        recordingTimer.textContent = "00:00";

        timerInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const minutes = String(Math.floor(elapsed / 60000)).padStart(2, "0");
            const seconds = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0");
            recordingTimer.textContent = `${minutes}:${seconds}`;
        }, 500);

    } catch {
        showToast("Microphone access denied!", "error");
    }
};

// Stop button — stops the recorder and resets UI
stopBtn.onclick = () => {
    try { 
        recorder.stop(); // Stop MediaRecorder safely
    } catch (e) { 
        console.warn("Recorder already stopped:", e); 
    }

    startBtn.style.display = "inline-flex";
    stopBtn.style.display = "none";

    clearInterval(timerInterval);
    recordingTimer.textContent = "00:00";

    canvas.classList.remove("show");
    canvas.style.display = "none";

    // Hide loader immediately if user stops recording
    if (loader) {
        loader.style.display = "none";
    } 

    // Cancel any pending transcription (optional)
    currentTranscriptionRequest = null;
};

// Helper function for transcription
async function fetchTranscription(audioBlob) {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.webm");

    const response = await fetch("/transcribe", { method: "POST", body: formData });

    if (!response.ok) {
        throw new Error("Transcription failed");
    } 
    const data = await response.json();
    return data.text || data.transcription || data.result || data.message || "";
}

// RESET button — clears everything
function resetApp() {
    if (recorder && recorder.state !== "inactive") {
        recorder.stop();
    } 
    audioChunks = [];
    transcriptBox.value = "";
    audioPlayback.src = "";
    audioPlayback.style.display = "none";

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cancelAnimationFrame(animationId);

    clearInterval(timerInterval);
    recordingTimer.style.display = "none";
    recordingTimer.textContent = "00:00";

    startBtn.style.display = "inline-flex";
    stopBtn.style.display = "none";

    loader.style.display = "none";

    canvas.style.display = "none";
    canvas.classList.remove("show");

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
}

resetBtn.onclick = () => {
    resetApp();
    showToast("App reset!", "info");
};

// Copy/download transcription
copyBtn.onclick = () => {
    if (!transcriptBox.value.trim()) {
       return showToast("Nothing to copy!", "warning");
    } 

    navigator.clipboard.writeText(transcriptBox.value);
    showToast("Copied!", "success");
};

downloadBtn.onclick = () => {
    if (!transcriptBox.value.trim()) {
        return showToast("Nothing to download!", "warning");
    }

    const blob = new Blob([transcriptBox.value], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "transcription.txt";
    a.click();
    showToast("Downloaded!", "success");
};
