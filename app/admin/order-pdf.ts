type PdfDocument={addImage(data:string,type:string,x:number,y:number,width:number,height:number):void;addPage():void;output(type:'blob'):Blob};
type PdfWindow=Window&{html2canvas?:(element:HTMLElement,options:Record<string,unknown>)=>Promise<HTMLCanvasElement>;jspdf?:{jsPDF:new(options:Record<string,unknown>)=>PdfDocument}};
let libraries:Promise<void>|null=null;
function script(src:string){return new Promise<void>((resolve,reject)=>{const tag=document.createElement('script');tag.src=src;tag.onload=()=>resolve();tag.onerror=()=>{tag.remove();reject(new Error('تعذر تحميل أداة PDF؛ أعد المحاولة.'))};document.head.append(tag)})}
async function load(){if(!libraries)libraries=Promise.all([script('/vendor/html2canvas-1.4.1.min.js'),script('/vendor/jspdf-3.0.4.min.js')]).then(()=>{}).catch(error=>{libraries=null;throw error});await libraries}
export async function downloadOrderPdf(source:HTMLElement,orderNumber:number,preparation:boolean){
 const printable=preparation?(source.matches('[data-order-preparation]')?source:source.querySelector<HTMLElement>('[data-order-preparation]')):source;
 if(!printable)throw new Error('نسخة التجهيز غير جاهزة؛ أعد فتح الطلب.');
 await load();await document.fonts?.ready;
 const win=window as PdfWindow;if(!win.html2canvas||!win.jspdf)throw new Error('أداة PDF غير جاهزة.');
 const holder=document.createElement('div'),clone=printable.cloneNode(true) as HTMLElement;
 holder.className='adminRedesign themeLight orderPdfExport';holder.style.cssText='position:absolute;left:-10000px;top:0;width:794px;background:white;color:#182626;direction:rtl;z-index:-1';
 clone.querySelectorAll('.noPrint,.pdfPreparationSource,.orderEditFields,.orderEditorMessage,button,script').forEach(element=>element.remove());
 clone.classList.add('orderPdfDocument');clone.style.cssText='display:block;position:static;width:794px;min-width:0;max-width:none;height:auto;min-height:0;max-height:none;overflow:visible;transform:none;box-shadow:none;background:white;color:#182626;padding:24px;box-sizing:border-box';
 clone.querySelectorAll('table').forEach(table=>{table.style.minWidth='0';table.style.width='100%'});
 clone.querySelectorAll('input,select,textarea').forEach(element=>element.remove());
 holder.append(clone);document.body.append(holder);
 try{
  const width=794,height=Math.ceil(clone.scrollHeight),scale=Math.min(1.5,Math.sqrt(12000000/(width*Math.max(height,1))));
  const rows=Array.from(clone.querySelectorAll('tr,.orderTotals,.printedNotes,.orderPrintFooter')).map(element=>{const rect=element.getBoundingClientRect(),root=clone.getBoundingClientRect();return{top:(rect.top-root.top)*scale,bottom:(rect.bottom-root.top)*scale}});
  const canvas=await win.html2canvas(clone,{backgroundColor:'#ffffff',scale,useCORS:true,allowTaint:false,imageTimeout:15000,logging:false,width,height,windowWidth:900,scrollX:0,scrollY:0});
  if(!canvas.width||!canvas.height)throw new Error('تعذر تجهيز صفحات PDF.');
  const pdf=new win.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true}),pageHeight=Math.floor(canvas.width*277/190);let start=0,page=0;
  while(start<canvas.height){let end=Math.min(canvas.height,start+pageHeight);const crossing=rows.find(row=>row.top>start+40&&row.top<end&&row.bottom>end&&row.bottom-row.top<=pageHeight);if(crossing)end=Math.floor(crossing.top);if(end<=start)end=Math.min(canvas.height,start+pageHeight);
   const sheet=document.createElement('canvas');sheet.width=canvas.width;sheet.height=end-start;const context=sheet.getContext('2d');if(!context)throw new Error('تعذر إنشاء صفحة PDF.');context.drawImage(canvas,0,start,canvas.width,end-start,0,0,canvas.width,end-start);if(page++)pdf.addPage();pdf.addImage(sheet.toDataURL('image/jpeg',.9),'JPEG',10,10,190,sheet.height*190/sheet.width);sheet.width=sheet.height=0;start=end;
  }
  const url=URL.createObjectURL(pdf.output('blob')),link=document.createElement('a');link.href=url;link.download=`order-${orderNumber}${preparation?'-preparation':''}.pdf`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);canvas.width=canvas.height=0;
 }finally{holder.remove()}
}
