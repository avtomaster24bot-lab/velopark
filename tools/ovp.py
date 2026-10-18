"""Запросы к Overpass API с повторами и сменой сервера."""
import json, sys, time, urllib.request, urllib.parse
UA = 'Velopark/1.0 (+https://avtomaster24bot-lab.github.io/velopark/)'
SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
def q(query, tries=6, timeout=600):
    err = None
    for i in range(tries):
        url = SERVERS[i % len(SERVERS)]
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({'data': query}).encode(), headers={'User-Agent': UA, 'Accept': '*/*'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except Exception as e:
            err = e; print('overpass retry', i, url, str(e)[:120], file=sys.stderr); time.sleep(15 + 15 * i)
    raise err
if __name__ == '__main__':
    out = sys.argv[2]; d = q(open(sys.argv[1]).read()); json.dump(d, open(out, 'w')); print(out, len(d.get('elements', [])))
