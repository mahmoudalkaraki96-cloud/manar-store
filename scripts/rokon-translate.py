import json, os, urllib.request, concurrent.futures, time
from pathlib import Path

def request(url, payload=None):
    headers = {"Content-Type":"application/json"}
    if url.startswith("https://api.openai.com/"):
        headers["Authorization"] = "Bearer " + os.environ["OPENAI_API_KEY"]
    data = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=150) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code not in (429,500,502,503,504) or attempt == 4:
                raise
            time.sleep(2 ** attempt)

catalog = request("https://rokon-store.mahmoud-alkaraki96.workers.dev/api/catalog")
products = []
for p in catalog["products"]:
    products.append({**{k:p.get(k) for k in ("id","itemNumber","name","description","specifications")},
                     "variants":[{"id":v["id"],"name":v["name"]} for v in p.get("variants",[]) if v.get("id") is not None]})
assert products and len({p["id"] for p in products}) == len(products)
out = Path("rokon-translations")
out.mkdir(exist_ok=True)
(out/"source.json").write_text(json.dumps(products,ensure_ascii=False),encoding="utf-8")

def translate(group):
    instruction = """Translate this Rokon Home catalog from Arabic to natural retail English (EN) and Hebrew (HE).
Return a JSON object with products, an array of objects with id, EN and HE (each containing name, description and specifications), and variants (an array of {id, EN:{name}, HE:{name}}). Copy IDs exactly. Keep quantities, units, material, brand and model codes. Preserve empty fields. Do not infer missing facts."""
    response = request("https://api.openai.com/v1/chat/completions", {
        "model":"gpt-5-mini","reasoning_effort":"minimal","max_completion_tokens":12000,
        "response_format":{"type":"json_object"},
        "messages":[{"role":"system","content":instruction},{"role":"user","content":json.dumps(group,ensure_ascii=False)}]})
    result = json.loads(response["choices"][0]["message"]["content"])["products"]
    expected = {p["id"]:{v["id"] for v in p["variants"]} for p in group}
    assert len(result)==len(group) and {p["id"] for p in result}==set(expected)
    for p in result:
        variants=p["variants"]
        assert len(variants)==len(expected[p["id"]]) and {v["id"] for v in variants}==expected[p["id"]]
        for language in ("EN","HE"):
            assert all(isinstance(p[language][f],str) for f in ("name","description","specifications")) and p[language]["name"].strip()
            assert all(isinstance(v[language]["name"],str) and v[language]["name"].strip() for v in variants)
    return result,response.get("usage",{})

groups=[products[i:i+8] for i in range(0,len(products),8)]
errors=[]
usage={"prompt_tokens":0,"completion_tokens":0}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool, (out/"review.jsonl").open("w",encoding="utf-8") as file:
    futures={pool.submit(translate,g):g for g in groups}
    for future in concurrent.futures.as_completed(futures):
        try:
            result,tokens=future.result()
        except Exception as error:
            errors.append({"ids":[p["id"] for p in futures[future]],"error":type(error).__name__})
            continue
        for key in usage: usage[key]+=tokens.get(key,0)
        file.writelines(json.dumps(p,ensure_ascii=False)+"\n" for p in result)
report={"products":len(products),"failed":errors,"usage_successful_groups":usage}
(out/"summary.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
print(f"Catalog: {len(products)} products, failed groups: {len(errors)}")
if errors: raise SystemExit(1)
