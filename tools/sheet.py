import json, io, urllib.request, sys, os
from PIL import Image, ImageDraw, ImageFont
UA = {'User-Agent': 'VeloparkBuilder/1.0 (github.com/avtomaster24bot-lab/velopark)'}
c = json.load(open('cache/cand.json')); os.makedirs('cache/thumbs', exist_ok=True)
slugs = list(c); per = 9
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14) if os.path.exists('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf') else None
for sh in range(0, len(slugs), per):
    W, H = 6*220, per*150; im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)
    for r, s in enumerate(slugs[sh:sh+per]):
        for k, x in enumerate(c[s][:6]):
            f = f'cache/thumbs/{s}-{k}.jpg'
            if not os.path.exists(f):
                u = x['thumb'].replace('/1280px-', '/330px-')
                try:
                    data = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
                    t = Image.open(io.BytesIO(data)).convert('RGB'); t.thumbnail((215, 125)); t.save(f)
                except Exception as e: print('err', s, k, e); continue
            t = Image.open(f); im.paste(t, (k*220, r*150+20))
        d.text((4, r*150+2), s, fill='red', font=font)
    im.save(f'cache/sheet{sh//per}.jpg', quality=80)
