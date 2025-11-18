from flask import Flask, request, jsonify, render_template
import whisper
import os
import traceback
import subprocess
import uuid
import shutil

app = Flask(__name__)

# Load the Whisper speech-to-text model ONCE at server start
print("🚀 Loading Whisper model...")
try:
    # Load the 'base' Whisper model. 
    # It's more accurate than 'tiny' but still lightweight.
    model = whisper.load_model("base")
    print("✅ Whisper model loaded!")
except Exception:
    # If model failed to load, log the error and disable transcription.
    print("❌ Failed to load Whisper model")
    traceback.print_exc()
    model = None  # Mark as unavailable

# Main page route — returns your index.html
# This file contains all your UI with Font Awesome icons.
@app.route("/")
def index():
    return render_template("index.html")


# /transcribe endpoint — runs when your JS uploads audio
# Accepts POST with a file, converts it, sends to Whisper.
@app.route("/transcribe", methods=["POST"])
def transcribe():
    # If Whisper failed to load earlier, stop here.
    if model is None:
        return jsonify({"error": "Whisper model not loaded"}), 500

    # Ensure an audio file was actually sent
    if "file" not in request.files:
        return jsonify({"error": "No audio file uploaded"}), 400

    audio_file = request.files["file"]

    # Check if the filename is valid
    if audio_file.filename == "":
        return jsonify({"error": "Empty file"}), 400

    # Generate unique temporary file names so users do not conflict
    uid = str(uuid.uuid4())
    webm_path = f"temp_{uid}.webm"  # Input format (recorded)
    wav_path = f"temp_{uid}.wav"    # Converted format (for Whisper)

    try:
        # Save uploaded .webm audio file to disk
        audio_file.save(webm_path)

        # Check if FFmpeg is installed on the system
        if shutil.which("ffmpeg") is None:
            return jsonify({"error": "FFmpeg not installed"}), 500

        # Convert WebM → WAV because Whisper requires WAV/PCM audio
        # -ar 16000 sets 16 kHz sample rate (recommended)
        # -ac 1 makes audio mono
        subprocess.run(
            ["ffmpeg", "-y", "-i", webm_path, "-ar", "16000", "-ac", "1", wav_path],
            stdout=subprocess.DEVNULL,   # Hide FFmpeg terminal output
            stderr=subprocess.DEVNULL
        )

        # Ensure the WAV file actually exists after conversion
        if not os.path.exists(wav_path):
            return jsonify({"error": "Audio conversion failed"}), 500

        # Run Whisper transcription
        # result["text"] returns the recognized spoken text
        result = model.transcribe(wav_path)
        text = result.get("text", "").strip()  # Clean whitespace

        # Return the transcription to the frontend as JSON
        return jsonify({"text": text or ""})

    except Exception as e:
        # If ANY error happens, log it for debugging
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    finally:
        # Cleanup: delete temporary files even if errors occur
        for f in [webm_path, wav_path]:
            if os.path.exists(f):
                try:
                    os.remove(f)
                except:
                    pass


# Run the Flask server
# host=0.0.0.0 allows access from local network
# debug=True prints error messages and auto reloads on changes
if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
