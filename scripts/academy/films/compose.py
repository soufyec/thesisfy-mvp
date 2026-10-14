"""Muxes the frames of one cut with its narration into MP4 and writes WebVTT captions. usage: compose2.py <intro_dir> <cut> <lang>"""
import json, subprocess, sys, os
I, cut, lang = sys.argv[1:4]
v = json.load(open(f"{I}/narr/cuts.json"))[cut][lang]
fd = f"{I}/video/frames-{cut}-{lang}"
frames = len([f for f in os.listdir(fd) if f.endswith(".jpg")]); total = frames / 25
out = f"{I}/video/thesisfic-{cut}-{lang}.mp4"
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-framerate", "25", "-i", f"{fd}/%05d.jpg", "-i", v["file"],
    "-filter_complex", f"[1:a]apad,atrim=0:{total:.3f},afade=t=out:st={total-0.8:.3f}:d=0.8[a]", "-map", "0:v", "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "160k", out], check=True)
def ts(x): h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60; return f"{h:02d}:{m:02d}:{s:06.3f}"
st = v["starts"] + [total]
with open(f"{I}/video/thesisfic-{cut}-{lang}.vtt", "w") as f:
    f.write("WEBVTT\n\n")
    for i, text in enumerate(v["caps"]):
        f.write(f"{i+1}\n{ts(st[i]+0.2)} --> {ts(st[i+1]-0.05)}\n{text}\n\n")
print(cut, lang, "frames", frames, "total", round(total, 2), os.path.getsize(out) // 1024, "KB")
