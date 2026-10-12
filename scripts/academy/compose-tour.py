"""Lays the narration over a tour take and writes the deliverables for one language.

    python3 scripts/academy/compose-tour.py <lang> [--out DIR] [--dest public/videos]

Expects DIR/<lang>/video.webm + marks.json (from record-tour.mjs), DIR/nar/<lang>_<scene>.wav and DIR/narration.json
(one Kokoro clip per scene; see docs/academy/tour.md). Produces tour-<lang>.mp4 (H.264 + AAC, 1280x720),
tour-<lang>.vtt (subtitles in the narration language) and tour-<lang>.jpg (poster), and prints the JSON to paste
into ONBOARDING_VIDEO in src/lib/onboarding.ts.
"""
import json, os, re, subprocess, sys

lang = sys.argv[1]
args = sys.argv[2:]
OUT = args[args.index("--out") + 1] if "--out" in args else "/tmp/tour-video"
DEST = args[args.index("--dest") + 1] if "--dest" in args else "public/videos"
os.makedirs(DEST, exist_ok=True)

take = os.path.join(OUT, lang)
marks = json.load(open(os.path.join(take, "marks.json")))["marks"]
dur = json.load(open(os.path.join(OUT, "nar", "durations.json")))[lang]
texts = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "tour-narration.json")))[lang]["scenes"]
scenes = [m for m in marks if m["key"] != "end"]
end = next(m["t"] for m in marks if m["key"] == "end")
LEAD = 0.4  # seconds of picture before the first word
start = max(0.0, scenes[0]["t"] - LEAD)
length = end - start

# ---------- audio: each clip delayed to its scene start, mixed, lightly normalised ----------
inputs = ["-i", os.path.join(take, "video.webm")]
chains, labels = [], []
for i, m in enumerate(scenes):
    wav = os.path.join(OUT, "nar", f"{lang}_{m['key']}.wav")
    inputs += ["-i", wav]
    ms = int(round((m["t"] - start) * 1000))
    chains.append(f"[{i + 1}:a]adelay={ms}|{ms}[a{i}]")
    labels.append(f"[a{i}]")
chains.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0:dropout_transition=0,loudnorm=I=-18:TP=-1.5:LRA=11,apad[a]")
chains.append(f"[0:v]trim=start={start:.3f},setpts=PTS-STARTPTS,scale=1280:720:flags=lanczos,fps=30,fade=t=in:st=0:d=0.4,fade=t=out:st={length - 0.6:.2f}:d=0.6,format=yuv420p[v]")
mp4 = os.path.join(DEST, f"tour-{lang}.mp4")
cmd = ["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(chains), "-map", "[v]", "-map", "[a]", "-t", f"{length:.3f}",
       "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-profile:v", "high", "-pix_fmt", "yuv420p",
       "-c:a", "aac", "-b:a", "96k", "-ac", "1", "-movflags", "+faststart", mp4]
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode:
    print(r.stderr[-1500:]); sys.exit(1)

# ---------- poster: a frame from the intro, once the editor is on screen ----------
jpg = os.path.join(DEST, f"tour-{lang}.jpg")
subprocess.run(["ffmpeg", "-y", "-ss", f"{min(length - 1, 9.0):.2f}", "-i", mp4, "-frames:v", "1", "-q:v", "4", jpg], capture_output=True)

# ---------- subtitles: one cue per sentence, timed by share of the scene's narration ----------
def ts(x):
    h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"

cues = []
for m in scenes:
    t0 = m["t"] - start + 0.25  # the clips carry 250 ms of leading silence
    total = dur[m["key"]] - 0.5
    parts = [p.strip() for p in re.split(r"(?<=[.!?:])\s+", texts[m["key"]]) if p.strip()]
    chars = sum(len(p) for p in parts) or 1
    at = t0
    for p in parts:
        d = total * len(p) / chars
        cues.append((at, at + d - 0.05, p))
        at += d
with open(os.path.join(DEST, f"tour-{lang}.vtt"), "w", encoding="utf-8") as f:
    f.write("WEBVTT\n\n")
    for i, (a, b, text) in enumerate(cues, 1):
        f.write(f"{i}\n{ts(a)} --> {ts(b)}\n{text}\n\n")

chapter_keys = {"intro": "writing", "assistant": "assistant", "ledger": "ledger", "advisor": "advisor"}
chapters = [{"at": round(m["t"] - start), "label": chapter_keys[m["key"]]} for m in scenes if m["key"] in chapter_keys]
chapters[0]["at"] = 0
size = os.path.getsize(mp4) / 1e6
print(json.dumps({"lang": lang, "duration": round(length), "chapters": chapters, "mp4_mb": round(size, 1)}))
