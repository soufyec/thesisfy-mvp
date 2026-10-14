"""Web versions of the films: 1280×720 H.264 (CRF 26) + AAC 96k, a poster frame and WebVTT, written to
<repo>/public/videos as <name>-<lang>.{mp4,jpg,vtt}; then fills the durations in src/lib/films.ts and the chapter
marks in src/lib/onboarding.ts. usage: web.py <intro_dir> <repo> [cut:lang ...]"""
import json, os, re, subprocess, sys
I, R = sys.argv[1], sys.argv[2]
C = json.load(open(f"{I}/narr/cuts.json"))
NAME = {"uni": "intro-university", "stu": "intro-student", "teaser": "teaser"}
KEY = {"uni": "university", "stu": "student", "teaser": "teaser"}
POSTER = {"uni": lambda v: v["starts"][2] + 3.6, "stu": lambda v: v["starts"][2] + 3.6, "teaser": lambda v: v["starts"][1] - 0.6}
items = [x.split(":") for x in sys.argv[3:]] or [(c, l) for c in NAME for l in ["en", "es", "fr", "de"]]
def master(c, l):
    p = f"{I}/video/thesisfic-{c}-{l}.mp4"
    return p if os.path.exists(p) else f"{I}/video/thesisfic-intro-{l}.mp4"
def ts(x): h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60; return f"{h:02d}:{m:02d}:{s:06.3f}"
out = f"{R}/public/videos"; os.makedirs(out, exist_ok=True)
for c, l in items:
    v = C[c][l]; src = master(c, l); base = f"{out}/{NAME[c]}-{l}"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-vf", "scale=1280:-2", "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-tune", "stillimage",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", base + ".mp4"], check=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", f"{POSTER[c](v):.2f}", "-i", src, "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "4", base + ".jpg"], check=True)
    total = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", base + ".mp4"], capture_output=True, text=True).stdout)
    st = v["starts"] + [total]
    with open(base + ".vtt", "w") as f:
        f.write("WEBVTT\n\n")
        for i, text in enumerate(v["caps"]): f.write(f"{i+1}\n{ts(st[i]+0.2)} --> {ts(st[i+1]-0.05)}\n{text}\n\n")
    v["web"] = round(total, 2)
    print(c, l, round(total, 2), "s", os.path.getsize(base + ".mp4") // 1024, "KB")
json.dump(C, open(f"{I}/narr/cuts.json", "w"), indent=1, ensure_ascii=False)
# durations and chapters into the code
dur = {KEY[c]: {l: round(C[c][l].get("web", 0)) for l in ["en", "es", "fr", "de"]} for c in NAME}
p = f"{R}/src/lib/films.ts"; s = open(p).read()
body = "\n".join(f"  {k}: {{ " + ", ".join(f"{l}: {v}" for l, v in d.items()) + " }," for k, d in dur.items())
s = re.sub(r"(const DURATION: Record<FilmKey, Record<Locale, number>> = )\{.*?\n\};", lambda m: m.group(1) + "{\n" + body + "\n};", s, flags=re.S)
open(p, "w").write(s)
p = f"{R}/src/lib/onboarding.ts"; s = open(p).read()
ch = "\n".join(f'  {l}: {{ ...student("{l}"), chapters: chapters({", ".join(str(int(C["stu"][l]["starts"][k])) for k in (5, 6, 10, 11))}) }},' for l in ["en", "es", "fr", "de"])
s = re.sub(r"(export const ONBOARDING_VIDEO: Record<Locale, OnboardingVideo> = )\{.*?\n\};", lambda m: m.group(1) + "{\n" + ch + "\n};", s, flags=re.S)
open(p, "w").write(s)
print(json.dumps(dur))
