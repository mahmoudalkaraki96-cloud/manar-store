export type WatermarkConfig={base:string;enabled:boolean;x:number;y:number;size:number};

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const legacyPositions:Record<string,[number,number]>={
  "top-left":[10,10],"top-center":[50,10],"top-right":[90,10],
  "center-left":[10,50],center:[50,50],"center-right":[90,50],
  "bottom-left":[10,90],"bottom-center":[50,90],"bottom-right":[90,90],
};

export function parseWatermark(value:string):WatermarkConfig{
  const marker="#wm=";
  const markerIndex=value.indexOf(marker);
  const base=markerIndex>=0?value.slice(0,markerIndex):value;
  const fragment=markerIndex>=0?value.slice(markerIndex+marker.length):"";
  const parts=fragment.split(",");
  const enabled=parts[0]!=="0";
  if(parts[1]==="xy"){
    return {base,enabled,x:clamp(Number(parts[2])||90,2,98),y:clamp(Number(parts[3])||90,2,98),size:clamp(Number(parts[4])||24,2,60)};
  }
  const [x,y]=legacyPositions[parts[1]||"bottom-right"]||legacyPositions["bottom-right"];
  return {base,enabled,x,y,size:clamp(Number(parts[2])||24,2,60)};
}

export function buildWatermark(base:string,config:Pick<WatermarkConfig,"enabled"|"x"|"y"|"size">){
  return `${base}#wm=${config.enabled?1:0},xy,${Math.round(clamp(config.x,2,98)*10)/10},${Math.round(clamp(config.y,2,98)*10)/10},${Math.round(clamp(config.size,2,60)*10)/10}`;
}
