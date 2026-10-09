"""Vertical cut with narration: scenes stretched to fit the voice, face box bottom-right, captions in the band."""
import json, subprocess, re
d=json.load(open('marks.json'))
marks=d['marks']; end=d['end']; off=d['firstFrameOffset']
lines=json.load(open('narration.json'))
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONTR='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def esc(s): return s.replace('\\','\\\\').replace("'", "’").replace(':','\\:').replace('%','\\%')
def dur_of(f): return float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f],capture_output=True,text=True).stdout.strip())
nar=[dur_of(f'nar_{i}.mp3') for i in range(len(lines))]
# scene boundaries in video time
starts=[max(0,m['t']-off) for m in marks]
bounds=starts+[end-off]
factors=[]
for i in range(len(starts)):
    scene=bounds[i+1]-bounds[i]
    factors.append(max(1.0,(nar[i]+0.6)/scene))
# piecewise-linear time map: each scene stretched by its factor, pre-roll unchanged
def tmap(x):
    y=min(x,starts[0]) if starts else x
    for i in range(len(starts)):
        a=bounds[i]; b=bounds[i+1]
        if x>a: y+= (min(x,b)-a)*factors[i]
    if x>bounds[-1]: y+= x-bounds[-1]
    return y
items=re.findall(r"file '([^']+)'\nduration ([0-9.]+)", open('frames.ffconcat').read())
t=0.0; out=["ffconcat version 1.0"]
for f,du in items:
    du=float(du)
    nd=tmap(t+du)-tmap(t)
    out.append(f"file '{f}'"); out.append(f"duration {max(0.01,nd):.3f}")
    t+=du
out.append(f"file '{items[-1][0]}'")
newstarts=[tmap(x) for x in starts]
nt=tmap(end-off)
open('frames2.ffconcat','w').write("\n".join(out))
total=nt
SHORT={"Le registre d'intégrité : l'étudiant et le tuteur\nvoient exactement la même chose":"Le registre d'intégrité : étudiant et tuteur\nvoient exactement la même chose"}
caps=[(newstarts[i], newstarts[i+1] if i+1<len(starts) else total+1, SHORT.get(marks[i]['caption'],marks[i]['caption'])) for i in range(len(starts))]
# video filters
filters=["[0:v]scale=1080:1280:flags=lanczos,setsar=1[rec]",
         "color=c=0x0f172a:s=1080x1920:d=%.2f[bg]" % (total+0.5),
         "[bg][rec]overlay=0:0:shortest=1[v1]"]
FX,FY,FW,FH=540,1460,500,420
chain=["drawbox=x=0:y=1280:w=1080:h=640:color=0x111c3a@1:t=fill",
       f"drawbox=x={FX}:y={FY}:w={FW}:h={FH}:color=0x1e293b@1:t=fill",
       f"drawbox=x={FX}:y={FY}:w={FW}:h={FH}:color=0x4c6ef5@0.95:t=4",
       f"drawbox=x={FX+10}:y={FY+10}:w={FW-20}:h={FH-20}:color=0x20c997@0.35:t=2",
       f"drawtext=fontfile={FONT}:text='TON VISAGE ICI':fontcolor=white@0.9:fontsize=36:x={FX}+({FW}-text_w)/2:y={FY+175}",
       f"drawtext=fontfile={FONTR}:text='caméra 500 x 420':fontcolor=white@0.55:fontsize=22:y={FY+230}:x={FX}+({FW}-text_w)/2",
       f"drawtext=fontfile={FONT}:text='Thesisfic.edu':fontcolor=0x9db2ff:fontsize=40:x=60:y=1690",
       f"drawtext=fontfile={FONTR}:text='Academy  ·  Épisode 1':fontcolor=white@0.6:fontsize=28:x=60:y=1750",
       f"drawtext=fontfile={FONTR}:text='L’éditeur, en 1 minute':fontcolor=white@0.6:fontsize=28:x=60:y=1790"]
for a,b,c in caps:
    ls=c.split('\n'); y0=1310
    for j,line in enumerate(ls):
        chain.append(f"drawtext=fontfile={FONT}:text='{esc(line)}':fontcolor=white:fontsize=37:x=(w-text_w)/2:y={y0+j*52}:enable='between(t,{a:.2f},{b:.2f})'")
filters.append("[v1]"+",".join(chain)+",format=yuv420p[vout]")
# audio: narration segments at their scene start + a soft generated pad
n=len(lines)
inputs=['-f','concat','-safe','0','-i','frames2.ffconcat']
for i in range(n): inputs+=['-i',f'nar_{i}.mp3']
achain=[]
for i in range(n):
    achain.append(f"[{i+1}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay={int(newstarts[i]*1000)}|{int(newstarts[i]*1000)},apad=whole_dur={total:.2f}[n{i}]")
achain.append("".join(f"[n{i}]" for i in range(n))+f"amix=inputs={n}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[voice]")
pad=(f"aevalsrc='0.10*sin(2*PI*110*t)*(0.6+0.4*sin(2*PI*0.08*t))+0.07*sin(2*PI*164.8*t)+0.06*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*0.11*t+1))+0.04*sin(2*PI*329.6*t)':s=44100:c=stereo:d={total:.2f},"
     f"lowpass=f=900,volume=-24dB,afade=t=in:d=2,afade=t=out:st={max(0,total-3):.2f}:d=3[pad]")
achain.append(pad)
achain.append("[voice][pad]amix=inputs=2:normalize=0[aout]")
open('filters2.txt','w').write(";".join(filters+achain))
cmd=['ffmpeg','-y']+inputs+['-filter_complex_script','filters2.txt','-map','[vout]','-map','[aout]','-r','30','-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-t',f'{total:.2f}','thesisfic-editeur-vertical-v2.mp4']
r=subprocess.run(cmd,capture_output=True,text=True)
print(r.returncode, r.stderr[-500:] if r.returncode else 'ok', 'total', round(total,1))
def ts(x):
    h=int(x//3600); m=int(x%3600//60); s=x%60
    return f"{h:02d}:{m:02d}:{int(s):02d},{int((s-int(s))*1000):03d}"
with open('sous-titres-v2.srt','w') as f:
    for i,(a,b,c) in enumerate(caps,1): f.write(f"{i}\n{ts(a)} --> {ts(min(b,total))}\n{c}\n\n")
json.dump({'starts':newstarts,'total':total,'factors':factors,'nar':nar},open('timeline2.json','w'),indent=1)
print([(round(s,1),round(f,2)) for s,f in zip(newstarts,factors)])
