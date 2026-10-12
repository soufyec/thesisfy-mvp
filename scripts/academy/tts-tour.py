"""Synthesises the tour narration, one clip per scene and language, with Kokoro (Apache 2.0 voices).

    python3 scripts/academy/tts-tour.py            # writes $TOUR_OUT/nar/<lang>_<scene>.wav + durations.json

Needs `pip install kokoro soundfile` and espeak-ng (Spanish and French G2P). Voices: af_heart (EN), ef_dora (ES),
ff_siwis (FR). Texts live in tour-narration.json.
"""
import json, soundfile as sf, numpy as np, os, warnings
OUT = os.environ.get("TOUR_OUT", "/tmp/tour-video")
os.makedirs(os.path.join(OUT, "nar"), exist_ok=True)
warnings.filterwarnings("ignore")
from kokoro import KPipeline
N = json.load(open(os.path.join(os.path.dirname(__file__), "tour-narration.json")))
out = {}
for L, cfg in N.items():
    p = KPipeline(lang_code=cfg["lang"], repo_id="hexgrad/Kokoro-82M")
    out[L] = {}
    for key, text in cfg["scenes"].items():
        audio = np.concatenate([a for _, _, a in p(text, voice=cfg["voice"], speed=0.97)])
        # 250 ms of silence at both ends so scenes never clip
        pad = np.zeros(int(24000 * 0.25), dtype=audio.dtype)
        audio = np.concatenate([pad, audio, pad])
        path = os.path.join(OUT, "nar", f"{L}_{key}.wav"); sf.write(path, audio, 24000)
        out[L][key] = round(len(audio) / 24000, 3)
        print(L, key, out[L][key])
json.dump(out, open(os.path.join(OUT, "nar", "durations.json"), "w"), indent=1)
