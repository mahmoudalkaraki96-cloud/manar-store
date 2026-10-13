import ast,sqlite3,unittest,pathlib,types,sys,os,tempfile,importlib.util
ROOT=pathlib.Path(__file__).parent
TREE=ast.parse((ROOT/'dofesh_batch_images.py').read_text(encoding='utf-8'))
SELECT=next(ast.literal_eval(n.value) for n in TREE.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SELECT' for t in n.targets))
class Tests(unittest.TestCase):
 def test_only_dofesh_drafts_original_primary_unsubmitted(self):
  db=sqlite3.connect(':memory:')
  db.executescript('CREATE TABLE products(id, item_number,name,active,deleted_at);CREATE TABLE product_media(id,product_id,url,is_primary,variant_id);CREATE TABLE product_keywords(product_id,keyword);CREATE TABLE image_ai_items(media_id);')
  for n in range(1,7):
   db.execute('INSERT INTO products VALUES(?,?,?, ?,NULL)',(n,n,'test',1 if n==2 else 0))
   db.execute('INSERT INTO product_media VALUES(?,?,?,1,?)',(n,n,'/media/edited/x' if n==4 else 'https://dofesh.ps/upload/a.jpg',1 if n==5 else None))
   db.execute('INSERT INTO product_keywords VALUES(?,?)',(n,'jabari-1' if n==3 else 'dofesh-'+str(n)))
  db.execute('INSERT INTO image_ai_items VALUES(6)')
  self.assertEqual([r[0] for r in db.execute(SELECT+'100')],[1])
 def test_preview_no_download_or_api_submission(self):
  fake=types.ModuleType('batch_catalog_images');fake.ensure_tables=lambda:None;fake.query=lambda _: {'results':[{'product_id':1,'item_number':1,'name':'test','media_id':1,'url':'https://dofesh.ps/upload/x.jpg'}]}
  fake.main=lambda:self.fail('API submission in preview')
  sys.modules['batch_catalog_images']=fake
  if 'PIL' not in sys.modules:
   pil=types.ModuleType('PIL');pil.Image=types.SimpleNamespace();sys.modules['PIL']=pil
  spec=importlib.util.spec_from_file_location('dofesh_test',ROOT/'dofesh_batch_images.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  module.urllib.request.build_opener=lambda *_:self.fail('Supplier download in preview')
  old=os.getcwd();prior=os.environ.pop('BATCH_MODE',None)
  try:
   with tempfile.TemporaryDirectory() as folder:
    os.chdir(folder)
    try:
     module.main();self.assertTrue(pathlib.Path('dofesh-batch-plan.json').exists())
    finally:os.chdir(old)
  finally:
   os.chdir(old)
   if prior is not None:os.environ['BATCH_MODE']=prior
 def test_invalid_count_stops_before_database(self):
  fake=types.ModuleType('batch_catalog_images');fake.ensure_tables=lambda:self.fail('Database queried for invalid input');sys.modules['batch_catalog_images']=fake
  if 'PIL' not in sys.modules:
   pil=types.ModuleType('PIL');pil.Image=types.SimpleNamespace();sys.modules['PIL']=pil
  spec=importlib.util.spec_from_file_location('dofesh_invalid',ROOT/'dofesh_batch_images.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  old=os.environ.get('IMAGE_COUNT');os.environ['IMAGE_COUNT']='101'
  try:
   with self.assertRaises(ValueError):module.main()
  finally:
   if old is None:os.environ.pop('IMAGE_COUNT',None)
   else:os.environ['IMAGE_COUNT']=old
if __name__=='__main__':unittest.main()