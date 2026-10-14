"""Aligns narration takes to scene texts with dynamic programming over pauses (as split2.py, generalised to any number of
segments), finds the slogan word onsets from a 10 ms loudness envelope and, per segment, its longest inner pause.
usage: python3 align.py <intro_dir>  → narr/align.json"""
import json, math, os, re, struct, subprocess, sys
I = sys.argv[1]; DL = os.path.join(I, "narr", "dl")
def clean(t): return re.sub(r"\[[^\]]*\]|/i\.ˈa/", "IA", t).replace("IA", "IA")
SC = json.load(open(os.path.join(I, "narr", "scenes.json")))
TXT = {
 "stu": {
  "en": ["The question is no longer whether you use it. It's how you use it well.", "That's why we created Thesisfic. More than a platform, it's the framework you need to combine AI with your own thinking.", "Learn to use AI... properly. Ethically. Responsibly."],
  "es": ["La pregunta ya no es si la usas. Es cómo la usas bien.", "Por eso creamos Thesisfic. Más que una plataforma, es el marco que necesitas para combinar la IA con tu propio pensamiento.", "Aprende a usar la IA de forma... correcta. Ética. Responsable."],
  "fr": ["La question n'est plus de savoir si vous l'utilisez, mais comment bien l'utiliser.", "C'est pour cela que nous avons créé Thesisfic. Plus qu'une plateforme, c'est le cadre dont vous avez besoin pour combiner l'IA et votre propre réflexion.", "Apprenez à utiliser l'IA de façon... appropriée. Éthique. Responsable."],
  "de": ["Die Frage ist nicht mehr, ob Sie sie nutzen, sondern wie Sie sie gut nutzen.", "Deshalb haben wir Thesisfic entwickelt. Mehr als eine Plattform: der Rahmen, den Sie brauchen, um KI mit Ihrem eigenen Denken zu verbinden.", "Lernen Sie, KI zu nutzen... richtig. Ethisch. Verantwortungsvoll."]},
 "tea": {
  "en": ["In the UK, 95% of undergraduates already use AI in their studies.", "So the question is no longer whether they use it. It's whether they learn to think with it.", "Every word they write, attributed.", "Every AI suggestion, declared.", "Every step, visible to them and to you.", "Thesisfic. Teach your students how to use AI... properly. Ethically. Responsibly."],
  "es": ["En el Reino Unido, el 95% de los universitarios ya usa la IA en sus estudios.", "Así que la pregunta ya no es si la usan. Es si aprenden a pensar con ella.", "Cada palabra que escriben, atribuida.", "Cada sugerencia de la IA, declarada.", "Cada paso, visible para ellos y para ti.", "Thesisfic. Enseña a tus estudiantes a usar la IA de forma... correcta. Ética. Responsable."],
  "fr": ["Au Royaume-Uni, 95 % des étudiants de premier cycle utilisent déjà l'IA dans leurs études.", "La question n'est donc plus de savoir s'ils l'utilisent. C'est de savoir s'ils apprennent à penser avec elle.", "Chaque mot écrit, attribué.", "Chaque suggestion de l'IA, déclarée.", "Chaque étape, visible pour eux et pour vous.", "Thesisfic. Apprenez à vos étudiants à utiliser l'IA de façon... appropriée. Éthique. Responsable."],
  "de": ["Im Vereinigten Königreich nutzen 95 % der Bachelorstudierenden KI bereits im Studium.", "Die Frage ist also nicht mehr, ob sie sie nutzen. Sondern ob sie lernen, mit ihr zu denken.", "Jedes geschriebene Wort, zugeordnet.", "Jeder KI-Vorschlag, offengelegt.", "Jeder Schritt, sichtbar für Ihre Studierenden und für Sie.", "Thesisfic. Zeigen Sie Ihren Studierenden, wie man KI nutzt... richtig. Ethisch. Verantwortungsvoll."]},
}
TXT["uni"] = {"es": SC["es"]}
def silences(path, db=-40, d=0.2):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", f"silencedetect=noise={db}dB:d={d}", "-f", "null", "-"], capture_output=True, text=True).stderr
    s, res = None, []
    for line in out.splitlines():
        m = re.search(r"silence_start: ([\d.]+)", line)
        if m: s = float(m.group(1))
        m = re.search(r"silence_end: ([\d.]+)", line)
        if m and s is not None: res.append((s, float(m.group(1)))); s = None
    return res
def duration(path):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True).stdout)
def envelope(path, start):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", str(start), "-i", path, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], capture_output=True).stdout
    n = len(raw) // 2; s = struct.unpack(f"<{n}h", raw[: n * 2]); W = 160
    return [20 * math.log10((math.sqrt(sum(x * x for x in s[i:i + W]) / W) or 1) / 32768) for i in range(0, n - W, W)]
def align(path, texts):
    dur = duration(path); sil = silences(path)
    lead = sil[0][1] if sil and sil[0][0] < 0.05 else 0.0
    tail = sil[-1][0] if sil and sil[-1][1] > dur - 0.05 else dur
    cand = [x for x in sil if x[0] > lead + 0.5 and x[1] < tail - 0.5 and x[1] - x[0] >= 0.3]
    chars = [len(t) for t in texts]; tot = sum(chars); exp = [(tail - lead) * c / tot for c in chars]
    K = len(texts) - 1; n = len(cand); NEG = -1e9
    pen = lambda a, b, k: 2.2 * abs((b - a) - exp[k]) / exp[k]
    best = [[NEG] * n for _ in range(K)]; back = [[-1] * n for _ in range(K)]
    for c in range(n): best[0][c] = 3.0 * (cand[c][1] - cand[c][0]) - pen(lead, cand[c][0], 0)
    for k in range(1, K):
        for c in range(n):
            for p in range(c):
                if best[k - 1][p] == NEG: continue
                v = best[k - 1][p] + 3.0 * (cand[c][1] - cand[c][0]) - pen(cand[p][1], cand[c][0], k)
                if v > best[k][c]: best[k][c], back[k][c] = v, p
    fin, fc = NEG, -1
    for c in range(n):
        if best[K - 1][c] == NEG: continue
        v = best[K - 1][c] - pen(cand[c][1], tail, K)
        if v > fin: fin, fc = v, c
    cuts, c = [], fc
    for k in range(K - 1, -1, -1): cuts.append(cand[c]); c = back[k][c]
    cuts.reverse()
    starts = [0.0] + [max(a + 0.25, b - 0.45) for a, b in cuts]
    segs = [(cuts[i - 1][1] if i else lead, cuts[i][0] if i < K else tail) for i in range(K + 1)]
    ratios = [round((b - a) / e, 2) for (a, b), e in zip(segs, exp)]
    # longest inner pause of each segment (used for the two-line scene)
    inner = []
    for a, b in segs:
        ps = [x for x in silences(path, d=0.12) if x[0] > a + 0.2 and x[1] < b - 0.2]
        inner.append(round(max(ps, key=lambda x: x[1] - x[0])[1], 3) if ps else None)
    # slogan words: voiced regions in the last segment, gaps under 250 ms merged, last three
    st = starts[-1]; e = envelope(path, st); voiced = [x > -40 for x in e]; regions, i = [], 0
    while i < len(voiced):
        if voiced[i]:
            j = i
            while j < len(voiced) and voiced[j]: j += 1
            regions.append([i, j]); i = j
        else: i += 1
    merged = []
    for r in regions:
        if merged and r[0] - merged[-1][1] < 25: merged[-1][1] = r[1]
        else: merged.append(r)
    merged = [r for r in merged if r[1] - r[0] >= 12]
    words = [round(st + a / 100, 3) for a, b in merged[-3:]]
    return {"dur": round(dur, 3), "lead": round(lead, 3), "tail": round(tail, 3), "starts": [round(x, 3) for x in starts], "ratios": ratios,
            "gaps": [round(b - a, 2) for a, b in cuts], "inner": inner, "words": words, "regions": [[round(st + a / 100, 2), round(st + b / 100, 2)] for a, b in merged[-5:]],
            "dev": round(sum(abs(r - 1) for r in ratios), 2)}
res = {}
for f in sorted(os.listdir(DL)):
    m = re.match(r"(\w\w)_(uni|stu|tea)_v(\d)\.mp3$", f)
    if not m: continue
    lang, cut, v = m.groups()
    r = align(os.path.join(DL, f), TXT[cut][lang]); r["file"] = f
    res.setdefault(cut, {}).setdefault(lang, []).append(r)
    print(f, "dur", r["dur"], "dev", r["dev"], "ratios", r["ratios"], "gaps", r["gaps"], "words", r["words"], "inner", r["inner"][:2])
json.dump(res, open(os.path.join(I, "narr", "align.json"), "w"), indent=1)
