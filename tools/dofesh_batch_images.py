"""Dofesh draft images: preview, preserve remote originals slowly, then existing Batch style."""
import json
import os
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image
import batch_catalog_images as batch
from catalog_batch_scope import product_scope

SELECT = """SELECT p.id AS product_id,p.item_number,p.name,m.id AS media_id,m.url
FROM product_media m JOIN products p ON p.id=m.product_id
LEFT JOIN image_ai_items ai ON ai.media_id=m.id
WHERE p.active=0 AND p.deleted_at IS NULL AND m.is_primary=1 AND m.variant_id IS NULL
AND ai.media_id IS NULL AND EXISTS(SELECT 1 FROM product_keywords k WHERE k.product_id=p.id AND k.keyword LIKE 'dofesh-%')
AND (m.url LIKE '/media/imports/%' OR m.url LIKE 'https://dofesh.ps/upload/%')
ORDER BY p.id DESC LIMIT """

def main():
    count=int(os.environ.get('IMAGE_COUNT','100'))
    mode=os.environ.get('BATCH_MODE','preview')
    if not 1<=count<=100 or mode not in ('preview','submit'):
        raise ValueError('Use 1-100 images and preview or submit mode')
    scope=product_scope()
    batch.ensure_tables()
    rows=batch.query(SELECT.replace('ORDER BY',scope+'ORDER BY')+str(count))['results']
    Path('dofesh-batch-plan.json').write_text(json.dumps({'name':'دوفش باتش امج','mode':mode,'image_count':len(rows),'products':rows},ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Dofesh draft images selected: {len(rows)}; mode: {mode}',flush=True)
    if mode=='preview' or not rows:
        return
    last_request=0.0
    for row in rows:
        original=row['url']
        if original.startswith('/media/imports/'):
            continue
        parsed=urlparse(original)
        if parsed.scheme!='https' or parsed.netloc!='dofesh.ps' or not parsed.path.startswith('/upload/'):
            raise ValueError('Unexpected supplier image URL')
        wait=max(0,60-(time.monotonic()-last_request))
        if wait: time.sleep(wait)
        last_request=time.monotonic()
        request=urllib.request.Request(original,headers={'User-Agent':'ManarImageImport/1.0 (+https://manarstore.ps)'})
        # No rapid retries or redirects to another host. Any supplier failure stops this run.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args,**kwargs): return None
        with urllib.request.build_opener(NoRedirect()).open(request,timeout=45) as response:
            data=response.read(20*1024*1024+1)
        if len(data)>20*1024*1024: raise ValueError('Image exceeds 20 MB')
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'original';source.write_bytes(data)
            with Image.open(source) as image:
                image.verify()
                fmt=image.format
            ext,mime={'JPEG':('jpg','image/jpeg'),'PNG':('png','image/png'),'WEBP':('webp','image/webp')}.get(fmt,(None,None))
            if not ext: raise ValueError('Unsupported original image format')
            key=f"imports/dofesh-drafts/product-{row['product_id']}-media-{row['media_id']}.{ext}"
            batch.wrangler('r2','object','put','manar-store-media/'+key,'--remote','--file',str(source),'--content-type',mime)
        new_url='/media/'+key
        changed=batch.query('UPDATE product_media SET url='+batch.q(new_url)+",updated_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id="+str(row['media_id'])+' AND product_id='+str(row['product_id'])+' AND url='+batch.q(original)+' AND EXISTS(SELECT 1 FROM products p WHERE p.id=product_media.product_id AND p.active=0 AND p.deleted_at IS NULL)') .get('meta',{}).get('changes')
        if changed!=1: raise RuntimeError('Draft or image changed; stopped before AI submission')
    os.environ['DOFESH_DRAFT_ONLY']='1'
    batch.main()

if __name__=='__main__':
    main()