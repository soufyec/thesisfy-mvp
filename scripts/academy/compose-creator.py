"""Creator-style cut: brand background, presenter window with name tag and cursor, big word captions, app as a floating window with zooms."""
import json, subprocess
tl=json.load(open('timeline2.json')); starts=tl['starts']; total=tl['total']
lines=json.load(open('narration.json')); words=json.load(open('words.json'))
marks=json.load(open('marks.json'))['marks']
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'; FONTR='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def esc(s): return s.replace('\\','\\\\').replace("'", "’").replace(':','\\:').replace('%','\\%').replace(',','\\,')
NAME='Soufiane'
FEATURE=["L'éditeur","Rédaction","Coller un passage","Attribution","Thesisfic AI","Coût avant insertion","Assisté par IA","Registre d'intégrité","Thesisfic.edu"]
# app window
AX,AY,AW,AH=140,900,800,948; BAR=40
# zoom regions in source coords (1080x1280), aspect 0.84375
FULL=(0,0,1080,1280); MED=(900,1067); STRONG=(760,901)
def roi(x,y,size): return (max(0,min(x,1080-size[0])),max(0,min(y,1280-size[1])),size[0],size[1])
ROIS=[FULL, roi(90,380,MED), roi(160,80,STRONG), roi(90,420,MED), FULL, roi(90,330,MED), roi(90,180,MED), roi(90,130,MED), FULL]
bounds=[0.0]+starts[1:]+[total]
# scene segments with zoompan tweens from the previous ROI
segs=[]; prev=FULL
for i in range(len(starts)):
    a=bounds[i]; b=bounds[i+1]
    (x0,y0,w0,h0)=prev; (x1,y1,w1,h1)=ROIS[i]
    z0=1080/w0; z1=1080/w1
    f='min(1\\,on/28)'
    segs.append(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS,fps=30,zoompan=z='{z0}+({z1}-{z0})*{f}':x='{x0}+({x1}-{x0})*{f}':y='{y0}+({y1}-{y0})*{f}':d=1:s={AW}x{AH}:fps=30[s{i}]")
    prev=ROIS[i]
n=len(starts)
filters=segs+["".join(f"[s{i}]" for i in range(n))+f"concat=n={n}:v=1:a=0[app]",
  f"color=c=0x4c6ef5:s=1080x1920:d={total+0.5:.2f}[bg]",
  # window shadows + frames
  "[bg]drawbox=x=104:y=164:w=900:h=540:color=0x1e1b4b@0.35:t=fill,drawbox=x=90:y=150:w=900:h=540:color=white:t=fill,"
  "drawbox=x=90:y=194:w=900:h=476:color=0x1f2937:t=fill,"
  f"drawtext=fontfile={FONT}:text='● ● ●':fontcolor=0x9ca3af:fontsize=22:x=120:y=161,"
  f"drawtext=fontfile={FONTR}:text='Ta caméra ici (900 x 476)':fontcolor=white@0.5:fontsize=28:x=(w-text_w)/2:y=420,"
  f"drawbox=x={AX-6+14}:y={AY-BAR-6+14}:w={AW+12}:h={AH+BAR+12}:color=0x1e1b4b@0.35:t=fill,"
  f"drawbox=x={AX-6}:y={AY-BAR-6}:w={AW+12}:h={AH+BAR+12}:color=white:t=fill,"
  f"drawtext=fontfile={FONT}:text='● ● ●':fontcolor=0x9ca3af:fontsize=22:x={AX+16}:y={AY-BAR+5},"
  f"drawtext=fontfile={FONTR}:text='thesisfic.edu/dashboard/editor':fontcolor=0x6b7280:fontsize=22:x={AX+110}:y={AY-BAR+7}[base]",
  f"[base][app]overlay={AX}:{AY}[v1]",
  "[v1][1:v]overlay=118:574[v2]"]
chain=[f"drawtext=fontfile={FONT}:text='{NAME}':fontcolor=0x111827:fontsize=36:box=1:boxcolor=0xffd43b:boxborderw=14:x=172:y=622",
       f"drawtext=fontfile={FONT}:text='Thesisfic.edu':fontcolor=white:fontsize=44:x=60:y=52",
       f"drawtext=fontfile={FONTR}:text='Academy · Épisode 1':fontcolor=white@0.8:fontsize=26:x=62:y=106"]
# feature chip, top right
for i in range(n):
    a=bounds[i]; b=bounds[i+1]
    chain.append(f"drawtext=fontfile={FONT}:text='{esc(FEATURE[i])}':fontcolor=0x111827:fontsize=32:box=1:boxcolor=white:boxborderw=16:x=w-text_w-76:y=60:enable='between(t,{a:.2f},{b:.2f})'")
# word-group captions between the windows
chunks=[]
for i,ws in enumerate(words):
    base=starts[i]; cur=[]; curlen=0
    for w in ws:
        if cur and (curlen+len(w['w'])+1>16 or len(cur)>=3):
            chunks.append((base+cur[0]['t'], None, " ".join(x['w'] for x in cur))); cur=[]; curlen=0
        cur.append(w); curlen+=len(w['w'])+1
    if cur: chunks.append((base+cur[0]['t'], base+cur[-1]['t']+cur[-1]['d']+0.5, " ".join(x['w'] for x in cur)))
for k in range(len(chunks)):
    a,b,txt=chunks[k]
    if b is None: b=chunks[k+1][0] if k+1<len(chunks) else total
    elif k+1<len(chunks): b=min(b,chunks[k+1][0])
    chain.append(f"drawtext=fontfile={FONT}:text='{esc(txt)}':fontcolor=white:fontsize=60:box=1:boxcolor=0x3f3f46@0.95:boxborderw=20:x=(w-text_w)/2:y=745:enable='between(t,{a:.2f},{b:.2f})'")
filters.append("[v2]"+",".join(chain)+",format=yuv420p[vout]")
# audio as in the narrated cut
inputs=['-f','concat','-safe','0','-i','frames2.ffconcat','-i','cursor.png']
for i in range(n): inputs+=['-i',f'nar_{i}.mp3']
ach=[]
for i in range(n):
    ms=int(starts[i]*1000)
    ach.append(f"[{i+2}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay={ms}|{ms},apad=whole_dur={total:.2f}[n{i}]")
ach.append("".join(f"[n{i}]" for i in range(n))+f"amix=inputs={n}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[voice]")
ach.append(f"aevalsrc='0.10*sin(2*PI*110*t)*(0.6+0.4*sin(2*PI*0.08*t))+0.07*sin(2*PI*164.8*t)+0.06*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*0.11*t+1))+0.04*sin(2*PI*329.6*t)':s=44100:c=stereo:d={total:.2f},lowpass=f=900,volume=-24dB,afade=t=in:d=2,afade=t=out:st={max(0,total-3):.2f}:d=3[pad]")
ach.append("[voice][pad]amix=inputs=2:normalize=0[aout]")
open('filters3.txt','w').write(";".join(filters+ach))
r=subprocess.run(['ffmpeg','-y']+inputs+['-filter_complex_script','filters3.txt','-map','[vout]','-map','[aout]','-r','30','-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-t',f'{total:.2f}','thesisfic-editeur-creator.mp4'],capture_output=True,text=True)
print(r.returncode, r.stderr[-700:] if r.returncode else 'ok', 'chunks', len(chunks))
