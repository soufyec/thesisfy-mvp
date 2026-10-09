
import json, subprocess
d=json.load(open('marks.json'))
marks=d['marks']; end=d['end']; off=d['firstFrameOffset']
dur=end-off
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONTR='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def esc(s): return s.replace('\\','\\\\').replace("'", "’").replace(':','\\:').replace('%','\\%')
caps=[]
for i,m in enumerate(marks):
    a=max(0,m['t']-off); b=(marks[i+1]['t']-off) if i+1<len(marks) else dur+1
    caps.append((a,b,m['caption']))
filters=["[0:v]scale=1080:1280:flags=lanczos,setsar=1[rec]",
         "color=c=0x0f172a:s=1080x1920:d=%.2f[bg]" % (dur+0.5),
         "[bg][rec]overlay=0:0:shortest=1[v1]"]
chain=["drawbox=x=0:y=1280:w=1080:h=640:color=0x111c3a@1:t=fill",
       "drawbox=x=40:y=1320:w=1000:h=560:color=0x4c6ef5@0.9:t=4",
       "drawbox=x=52:y=1332:w=976:h=536:color=0x20c997@0.35:t=2",
       f"drawtext=fontfile={FONT}:text='TON VISAGE ICI':fontcolor=white@0.92:fontsize=58:x=(w-text_w)/2:y=1540",
       f"drawtext=fontfile={FONTR}:text='Remplace cette zone par ta caméra (1080 x 640)':fontcolor=white@0.6:fontsize=30:x=(w-text_w)/2:y=1620",
       f"drawtext=fontfile={FONT}:text='Thesisfic.edu':fontcolor=0x9db2ff:fontsize=34:x=60:y=1360",
       f"drawtext=fontfile={FONTR}:text='Academy  ·  Épisode 1  ·  L’éditeur':fontcolor=white@0.55:fontsize=28:x=60:y=1404"]
for a,b,c in caps:
    lines=c.split('\n'); y0=1280-150-(len(lines)*54)
    for j,line in enumerate(lines):
        chain.append(f"drawtext=fontfile={FONT}:text='{esc(line)}':fontcolor=white:fontsize=40:box=1:boxcolor=0x0f172a@0.8:boxborderw=14:x=(w-text_w)/2:y={y0+j*54}:enable='between(t,{a:.2f},{b:.2f})'")
filters.append("[v1]"+",".join(chain)+",format=yuv420p[out]")
open('filters.txt','w').write(";".join(filters))
r=subprocess.run(['ffmpeg','-y','-f','concat','-safe','0','-i','frames.ffconcat','-filter_complex_script','filters.txt','-map','[out]','-r','30','-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart','-t',f'{dur:.2f}','thesisfic-editeur-vertical.mp4'],capture_output=True,text=True)
print(r.returncode, r.stderr[-400:] if r.returncode else 'ok')
def ts(x):
    h=int(x//3600); m=int(x%3600//60); s=x%60
    return f"{h:02d}:{m:02d}:{int(s):02d},{int((s-int(s))*1000):03d}"
with open('sous-titres.srt','w') as f:
    for i,(a,b,c) in enumerate(caps,1): f.write(f"{i}\n{ts(a)} --> {ts(min(b,dur))}\n{c}\n\n")
print('duration',round(dur,1)); print([(round(a,1),c.split(chr(10))[0][:28]) for a,b,c in caps])
