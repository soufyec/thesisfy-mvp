"""Builds the narration of the three cuts and their timings. University: the original takes (Spanish replaced by the new
take that says IA in Spanish). Students: university scene 1 + student scenes 2-3 + university scenes 4-12 + student slogan,
spliced in the pauses and level-matched. Teaser: its own take. Writes page/narration/<cut>-<lang>.mp3 and narr/cuts.json.
usage: python3 assemble.py <intro_dir>"""
import json, os, re, shutil, subprocess, sys
I = sys.argv[1]; N = os.path.join(I, "narr"); OUT = os.path.join(I, "page", "narration")
A = json.load(open(os.path.join(N, "align.json"))); T = json.load(open(os.path.join(N, "timings.json"))); SC = json.load(open(os.path.join(N, "scenes.json")))
import ast; TXTS = ast.literal_eval(re.search(r"TXT = (\{.*?\n\})\n", open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "align.py")).read(), re.S).group(1))
PICK = {"uni": {"es": "es_uni_v4.mp3"}, "stu": {"es": "es_stu_v2.mp3", "en": "en_stu_v1.mp3", "fr": "fr_stu_v1.mp3", "de": "de_stu_v2.mp3"},
        "tea": {"en": "en_tea_v3.mp3", "es": "es_tea_v2.mp3", "fr": "fr_tea_v2.mp3", "de": "de_tea_v1.mp3"}}
END = {"en": "Teach your students how to use AI: properly, ethically, responsibly.", "es": "Enseña a tus estudiantes a usar la IA de forma correcta, ética y responsable.", "fr": "Apprenez à vos étudiants à utiliser l'IA de façon appropriée, éthique et responsable.", "de": "Zeigen Sie Ihren Studierenden, wie man KI richtig, ethisch und verantwortungsvoll nutzt."}
STU_END = {"en": "Learn to use AI: properly, ethically, responsibly.", "es": "Aprende a usar la IA de forma correcta, ética y responsable.", "fr": "Apprenez à utiliser l'IA de façon appropriée, éthique et responsable.", "de": "Lernen Sie, KI richtig, ethisch und verantwortungsvoll zu nutzen."}
def pick(cut, lang): return next(r for r in A[cut][lang] if r["file"] == PICK[cut][lang])
def mean_db(path):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(re.search(r"mean_volume: (-?[\d.]+) dB", out).group(1))
R3 = lambda xs: [round(x, 3) for x in xs]
cuts = {"uni": {}, "stu": {}, "teaser": {}}
os.makedirs(OUT, exist_ok=True)
# university
for lang in ["en", "es", "fr", "de"]:
    if lang == "es":
        r = pick("uni", "es"); src = os.path.join(N, "dl", r["file"]); u = {"file": src, "dur": r["dur"], "starts": r["starts"], "words": r["words"]}
    else:
        v = T["takes"][lang][T["best"][lang]]; src = os.path.join(N, v["file"]); u = {"file": src, "dur": v["dur"], "starts": v["starts"], "words": v["words"]}
    shutil.copyfile(src, os.path.join(OUT, f"uni-{lang}.mp3"))
    caps = SC[lang][:12] + [END[lang]]
    cuts["uni"][lang] = {**u, "caps": caps}
# students
for lang in ["en", "es", "fr", "de"]:
    u = cuts["uni"][lang]; r = pick("stu", lang); sf = os.path.join(N, "dl", r["file"]); U, Sx = u["starts"], r["starts"]
    gain = mean_db(u["file"]) - mean_db(sf)
    pieces = [(u["file"], 0, U[1], 0), (sf, 0, Sx[1], gain), (sf, Sx[1], Sx[2], gain), (u["file"], U[3], U[12], 0), (sf, Sx[2], r["dur"], gain)]
    args, fl = [], []
    for k, (f, a, b, g) in enumerate(pieces):
        args += ["-i", f]
        fl.append(f"[{k}:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=mono,volume={g:.2f}dB,afade=t=in:d=0.01,afade=t=out:st={b - a - 0.01:.3f}:d=0.01[p{k}]")
    out = os.path.join(OUT, f"stu-{lang}.mp3")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *args, "-filter_complex", ";".join(fl) + ";" + "".join(f"[p{k}]" for k in range(5)) + "concat=n=5:v=0:a=1[a]", "-map", "[a]", "-c:a", "libmp3lame", "-b:a", "128k", out], check=True)
    L = [b - a for _, a, b, _ in pieces]
    s04 = L[0] + L[1] + L[2]; s13 = s04 + L[3]
    starts = [0, L[0], L[0] + L[1], s04] + [s04 + (U[k] - U[3]) for k in range(4, 12)] + [s13]
    words = [s13 + (w - Sx[2]) for w in r["words"]]
    caps = [SC[lang][0]] + TXTS["stu"][lang][:2] + SC[lang][3:12] + [STU_END[lang]]
    cuts["stu"][lang] = {"file": out, "dur": round(sum(L), 3), "starts": R3(starts), "words": R3(words), "caps": caps, "gain": round(gain, 2), "src": r["file"]}
# teaser
for lang in ["en", "es", "fr", "de"]:
    r = pick("tea", lang); src = os.path.join(N, "dl", r["file"]); out = os.path.join(OUT, f"teaser-{lang}.mp3"); shutil.copyfile(src, out)
    t = TXTS["tea"][lang]; caps = t[:5] + [t[5].replace("...", "")]
    cuts["teaser"][lang] = {"file": out, "dur": r["dur"], "starts": r["starts"], "words": r["words"], "pair": round(r["inner"][1] - r["starts"][1], 3), "caps": caps, "src": r["file"]}
json.dump(cuts, open(os.path.join(N, "cuts.json"), "w"), indent=1, ensure_ascii=False)
for c, v in cuts.items():
    for lang, x in v.items(): print(c, lang, "dur", x["dur"], "starts", x["starts"][:5], "...", x["starts"][-1], "words", x["words"], x.get("pair", ""))
