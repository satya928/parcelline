(function(){
"use strict";

/* =========================================================
   ParcelLine — PID / address → parcel, official municipality,
   boundary, neighbours, directions.
   ========================================================= */

const CFG = window.PARCELLINE_CONFIG || {};
const SAMPLES = window.PARCELLINE_SAMPLES || {};
let DEMO = !!CFG.demo;

/* ---------------- utilities ---------------- */
const $ = id => document.getElementById(id);
const digits = s => String(s||"").replace(/\D/g,"");
const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const qs = o => Object.entries(o).map(([k,v])=>encodeURIComponent(k)+"="+encodeURIComponent(v)).join("&");
const title = s => String(s||"").toLowerCase().replace(/\b([a-z])/g,m=>m.toUpperCase()).replace(/\bRte\b/g,"Route");
const store = {
  get(k){try{return localStorage.getItem(k)||"";}catch(e){return "";}},
  set(k,v){try{localStorage.setItem(k,v);}catch(e){}},
  del(k){try{localStorage.removeItem(k);}catch(e){}}
};
async function getJSON(url, ms){
  const ctl = new AbortController(); const t = setTimeout(()=>ctl.abort(), ms||20000);
  try{
    const r = await fetch(url,{headers:{Accept:"application/json"},signal:ctl.signal});
    if(!r.ok) throw new Error("HTTP "+r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const nf0=new Intl.NumberFormat("en-CA",{maximumFractionDigits:0});
const nf1=new Intl.NumberFormat("en-CA",{maximumFractionDigits:1});
const nf2=new Intl.NumberFormat("en-CA",{maximumFractionDigits:2});
const acres = m2 => m2/4046.8564;
const fmtAcres = m2 => { const a=acres(m2); return (a<10?nf2.format(a):nf1.format(a))+" acres"; };
const fmtLen = m => m>=1000 ? nf2.format(m/1000)+" km" : nf1.format(m)+" m";

/* ---------------- provinces ---------------- */
const PROV = {
  BC:{name:"British Columbia", short:"BC", idName:"PID",
      viewer:{label:"iMapBC", url:"https://maps.gov.bc.ca/ess/hm/imap4m/"},
      registry:{label:"LTSA Explorer (title search)", url:"https://explorer.ltsa.ca/"}},
  NB:{name:"New Brunswick", short:"NB", idName:"PID",
      viewer:{label:"GeoNB map viewer", url:"https://geonb.snb.ca/geonb/"},
      registry:{label:"SNB PLANET (title search)", url:"https://www.pxw1.snb.ca/snb7001/e/2000/2500e.asp"}},
  PE:{name:"Prince Edward Island", short:"PEI", idName:"PID",
      viewer:{label:"PEI property map", url:"https://www.arcgis.com/apps/instant/sidebar/index.html?appid=a28e65a23d4843548b4a9d16df740754"},
      registry:{label:"GeoLinc Plus (title search)", url:"https://www.princeedwardisland.ca/en/topic/maps-and-locations"}}
};
function provinceAt(lat,lng){
  if(lng<-114&&lng>-139.2&&lat>48.2&&lat<60.1) return "BC";
  if(lng>-64.5&&lng<-61.9&&lat>45.9&&lat<47.1) return "PE";
  if(lng>-69.1&&lng<-63.7&&lat>44.5&&lat<48.1) return "NB";
  return null;
}
function provOrder(d){
  if(d.length===9) return ["BC","NB","PE"];
  if(d.length===8) return ["NB","BC","PE"];
  if(d.length<=7) return ["PE","BC","NB"];
  return ["BC","NB","PE"];
}

/* =========================================================
   Geometry
   ========================================================= */
const R=6371008.8, rad=d=>d*Math.PI/180, deg=r=>r*180/Math.PI;
function dist(a,b){const dLat=rad(b[1]-a[1]),dLng=rad(b[0]-a[0]);const h=Math.sin(dLat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
function bearing(a,b){const y=Math.sin(rad(b[0]-a[0]))*Math.cos(rad(b[1]));const x=Math.cos(rad(a[1]))*Math.sin(rad(b[1]))-Math.sin(rad(a[1]))*Math.cos(rad(b[1]))*Math.cos(rad(b[0]-a[0]));return (deg(Math.atan2(y,x))+360)%360;}
const compass = d => ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"][Math.round(d/22.5)%16];
function outerRings(g){ if(!g) return []; return g.type==="Polygon"?[g.coordinates[0]]:g.type==="MultiPolygon"?g.coordinates.map(p=>p[0]):[]; }
function ringArea(r){let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(r[j][0]*r[i][1]-r[i][0]*r[j][1]);return a/2;}
function centroid(g){
  let best=null,bestA=0;
  outerRings(g).forEach(r=>{const a=Math.abs(ringArea(r)); if(a>bestA){bestA=a;best=r;}});
  if(!best) return null;
  let x=0,y=0,A=0;
  for(let i=0,j=best.length-1;i<best.length;j=i++){const f=best[j][0]*best[i][1]-best[i][0]*best[j][1];x+=(best[j][0]+best[i][0])*f;y+=(best[j][1]+best[i][1])*f;A+=f;}
  if(Math.abs(A)<1e-14) return {lng:best[0][0],lat:best[0][1]};
  A*=3; return {lng:x/A,lat:y/A};
}
function bounds(g){
  let w=180,e=-180,s=90,n=-90;
  outerRings(g).forEach(r=>r.forEach(([x,y])=>{if(x<w)w=x;if(x>e)e=x;if(y<s)s=y;if(y>n)n=y;}));
  return {w,e,s,n};
}
function padBounds(b){
  const cx=(b.w+b.e)/2, cy=(b.s+b.n)/2;
  const mLat=160/111320, mLng=160/(111320*Math.cos(rad(cy)));
  const hw=Math.max((b.e-b.w)*0.9,mLng), hh=Math.max((b.n-b.s)*0.9,mLat);
  return {w:cx-hw,e:cx+hw,s:cy-hh,n:cy+hh};
}
function sides(g){
  const out=[];
  outerRings(g).forEach(ring=>{
    const pts=ring.slice();
    if(pts.length>1&&pts[0][0]===pts[pts.length-1][0]&&pts[0][1]===pts[pts.length-1][1]) pts.pop();
    if(pts.length<3) return;
    const segs=pts.map((p,i)=>({a:p,b:pts[(i+1)%pts.length]})).filter(s=>dist(s.a,s.b)>0.05);
    const turn=(s1,s2)=>Math.abs(((bearing(s1.a,s1.b)-bearing(s2.a,s2.b)+540)%360)-180);
    const merged=[];
    segs.forEach(s=>{
      const last=merged[merged.length-1];
      if(last&&turn(last,s)<4){last.b=s.b;last.pts.push(s.b);return;}
      merged.push({a:s.a,b:s.b,pts:[s.a,s.b]});
    });
    if(merged.length>2){const f=merged[0],l=merged[merged.length-1]; if(turn(l,f)<4){f.a=l.a;f.pts=l.pts.concat(f.pts.slice(1));merged.pop();}}
    merged.forEach(m=>{
      let len=0; for(let i=1;i<m.pts.length;i++) len+=dist(m.pts[i-1],m.pts[i]);
      out.push({len,brg:bearing(m.a,m.b),mid:midAlong(m.pts,len/2)});
    });
  });
  return out;
}
function midAlong(pts,target){
  let acc=0;
  for(let i=1;i<pts.length;i++){const d=dist(pts[i-1],pts[i]); if(acc+d>=target){const t=d?(target-acc)/d:0;return [pts[i-1][0]+(pts[i][0]-pts[i-1][0])*t,pts[i-1][1]+(pts[i][1]-pts[i-1][1])*t];} acc+=d;}
  return pts[pts.length-1];
}

/* =========================================================
   Live data sources
   ========================================================= */
const BC_WFS="https://openmaps.gov.bc.ca/geo/pub/wfs";
const BC_PARCELS="pub:WHSE_CADASTRE.PMBC_PARCEL_FABRIC_POLY_SVW";
const BC_MUNIS="pub:WHSE_LEGAL_ADMIN_BOUNDARIES.ABMS_MUNICIPALITIES_SP";
const BC_GEOCODER="https://geocoder.api.gov.bc.ca";
const NB_PARCELS="https://geonb.snb.ca/arcgis/rest/services/GeoNB_SNB_Parcels/MapServer/0/query";
const NB_GOV="https://geonb.snb.ca/arcgis/rest/services/GeoNB_ELG_Local_Governance/MapServer/";
const PE_BASE="https://gis.princeedwardisland.ca/server/rest/services/";
const PE_PARCELS=PE_BASE+"property_parcels/FeatureServer/0/query";
const NOMINATIM="https://nominatim.openstreetmap.org";

async function wfs(layer,cql,max,props){
  const p={service:"WFS",version:"1.0.0",request:"GetFeature",typeName:layer,outputFormat:"application/json",srsName:"EPSG:4326",CQL_FILTER:cql,maxFeatures:max||25};
  if(props) p.propertyName=props;
  return (await getJSON(BC_WFS+"?"+qs(p))).features||[];
}
const ptWKT=(lat,lng)=>"SRID=4326;POINT("+lng+" "+lat+")";
const boxWKT=b=>"SRID=4326;POLYGON(("+b.w+" "+b.s+","+b.e+" "+b.s+","+b.e+" "+b.n+","+b.w+" "+b.n+","+b.w+" "+b.s+"))";
async function ags(url,params){
  const j=await getJSON(url+"?"+qs(Object.assign({outFields:"*",outSR:4326,f:"geojson",returnGeometry:true},params)));
  if(j.error) throw new Error(j.error.message||"Service error");
  return j.features||[];
}
const agsPt=(lat,lng)=>({geometry:lng+","+lat,geometryType:"esriGeometryPoint",inSR:4326,spatialRel:"esriSpatialRelIntersects"});
const agsBox=b=>({geometry:[b.w,b.s,b.e,b.n].join(","),geometryType:"esriGeometryEnvelope",inSR:4326,spatialRel:"esriSpatialRelIntersects"});
function mergePieces(features,key){
  const g=new Map();
  features.forEach(f=>{const k=String(f.properties[key]); if(!g.has(k)) g.set(k,[]); g.get(k).push(f);});
  return [...g.values()].map(list=>{
    const polys=[];
    list.forEach(f=>{ if(!f.geometry) return;
      if(f.geometry.type==="Polygon") polys.push(f.geometry.coordinates);
      else if(f.geometry.type==="MultiPolygon") f.geometry.coordinates.forEach(c=>polys.push(c)); });
    return {props:list[0].properties,all:list.map(f=>f.properties),
      geometry:polys.length===1?{type:"Polygon",coordinates:polys[0]}:{type:"MultiPolygon",coordinates:polys}};
  });
}

/* ---- BC ---- */
function cleanBCName(s){
  if(!s) return null;
  const m=String(s).match(/^(.*),\s*(City|Town|District|Village|Municipality|Township|Resort Municipality|Island Municipality|City and District|Mountain Resort Municipality) of$/i);
  return m?(m[2]+" of "+m[1]):s;
}
function recBC(p,geometry){
  return {prov:"BC",pid:p.PID||(p.PID_FORMATTED?digits(p.PID_FORMATTED):null),
    pidFmt:p.PID_FORMATTED||(p.PID?String(p.PID).replace(/^(\d{3})(\d{3})(\d{3})$/,"$1-$2-$3"):"PIN "+(p.PIN||"–")),
    geometry,area:p.FEATURE_AREA_SQM,perim:p.FEATURE_LENGTH_M,
    parcelMuni:cleanBCName(p.MUNICIPALITY),
    district:{label:"Regional district",value:p.REGIONAL_DISTRICT||null},ownerType:p.OWNER_TYPE||null,
    facts:[["Parcel type",p.PARCEL_CLASS],["Ownership type",p.OWNER_TYPE],["Survey plan",p.PLAN_NUMBER,"mono"],
      ["Status",p.PARCEL_STATUS],["Crown PIN",p.PIN,"mono"],["Record updated",p.WHEN_UPDATED?String(p.WHEN_UPDATED).replace(/Z$/,""):null]]};
}
const LIVE = {
  BC:{
    async byPid(d){const n=parseInt(d,10); if(!n) return []; return (await wfs(BC_PARCELS,"PID_NUMBER="+n)).map(f=>recBC(f.properties,f.geometry));},
    async at(lat,lng){return (await wfs(BC_PARCELS,"INTERSECTS(SHAPE,"+ptWKT(lat,lng)+")")).map(f=>recBC(f.properties,f.geometry));},
    async neighbours(b){return (await wfs(BC_PARCELS,"INTERSECTS(SHAPE,"+boxWKT(b)+")",300,"PID_FORMATTED,PID,SHAPE")).map(f=>({pid:f.properties.PID_FORMATTED||f.properties.PID||null,geometry:f.geometry}));},
    async muni(rec){
      const c=rec.centroid;
      const f=(await wfs(BC_MUNIS,"INTERSECTS(SHAPE,"+ptWKT(c.lat,c.lng)+")",1,"ADMIN_AREA_NAME,WEBSITE_URL,FEATURE_AREA_SQM,SHAPE"))[0];
      if(f) return {name:f.properties.ADMIN_AREA_NAME||rec.parcelMuni,official:true,source:"BC municipal boundaries",website:f.properties.WEBSITE_URL,areaKm2:f.properties.FEATURE_AREA_SQM/1e6,geometry:f.geometry};
      if(rec.parcelMuni) return {name:rec.parcelMuni,official:true,source:"ParcelMap BC"};
      return {name:null,official:true,unincorporated:"Unincorporated area"+(rec.district.value?" of the "+rec.district.value:""),source:"BC municipal boundaries"};
    },
    async address(rec){
      const c=rec.centroid;
      try{
        const j=await getJSON(BC_GEOCODER+"/sites/nearest.json?"+qs({point:c.lng+","+c.lat,outputSRS:4326,maxDistance:80,locationDescriptor:"parcelPoint"}),10000);
        const p=j.properties||{};
        if(p.fullAddress) return {line:p.fullAddress.replace(/, BC$/,""),source:"BC Address Geocoder",approx:false};
      }catch(e){}
      return osmAddress(c);
    }
  },
  NB:{
    async byPid(d){const n=parseInt(d,10); if(!n) return []; return mergePieces(await ags(NB_PARCELS,{where:"PID_INT="+n}),"PID").map(recNB);},
    async at(lat,lng){const ids=[...new Set((await ags(NB_PARCELS,Object.assign(agsPt(lat,lng),{returnGeometry:false,outFields:"PID_INT"}))).map(f=>f.properties.PID_INT))];
      const out=[]; for(const id of ids.slice(0,6)) out.push(...await LIVE.NB.byPid(String(id))); return out;},
    async neighbours(b){return (await ags(NB_PARCELS,Object.assign(agsBox(b),{outFields:"PID"}))).map(f=>({pid:f.properties.PID,geometry:f.geometry}));},
    async muni(rec){
      const c=rec.centroid, base={returnGeometry:true,maxAllowableOffset:0.0004};
      const [lg,rd,rsc]=await Promise.all([
        ags(NB_GOV+"8/query",Object.assign(agsPt(c.lat,c.lng),base)).catch(()=>[]),
        ags(NB_GOV+"5/query",Object.assign(agsPt(c.lat,c.lng),base)).catch(()=>[]),
        ags(NB_GOV+"2/query",Object.assign(agsPt(c.lat,c.lng),{returnGeometry:false})).catch(()=>[])]);
      const rscName=rsc[0]?rsc[0].properties.Region:null;
      if(lg[0]) return {name:lg[0].properties.Name,kind:lg[0].properties.Type_Name,official:true,source:"GeoNB Local Governance",geometry:lg[0].geometry,rsc:rscName};
      if(rd[0]) return {name:rd[0].properties.Name,kind:"Rural district",official:true,source:"GeoNB Local Governance",geometry:rd[0].geometry,rsc:rscName};
      return {name:null,official:true,unincorporated:"Outside any local government",source:"GeoNB Local Governance",rsc:rscName};
    },
    async address(rec){return osmAddress(rec.centroid);}
  },
  PE:{
    async byPid(d){const n=parseInt(d,10); if(!n) return []; return mergePieces(await ags(PE_PARCELS,{where:"pid_num="+n}),"PID").map(recPE);},
    async at(lat,lng){const ids=[...new Set((await ags(PE_PARCELS,Object.assign(agsPt(lat,lng),{returnGeometry:false,outFields:"pid_num"}))).map(f=>f.properties.pid_num))];
      const out=[]; for(const id of ids.slice(0,6)) out.push(...await LIVE.PE.byPid(String(id))); return out;},
    async neighbours(b){return (await ags(PE_PARCELS,Object.assign(agsBox(b),{outFields:"PID"}))).map(f=>({pid:f.properties.PID,geometry:f.geometry}));},
    async muni(rec){
      const c=rec.centroid;
      const [mu,co,lot]=await Promise.all([
        ags(PE_BASE+"municipal_zones/FeatureServer/0/query",Object.assign(agsPt(c.lat,c.lng),{returnGeometry:true,maxAllowableOffset:0.0004})).catch(()=>[]),
        ags(PE_BASE+"county_zones/FeatureServer/0/query",Object.assign(agsPt(c.lat,c.lng),{returnGeometry:false})).catch(()=>[]),
        ags(PE_BASE+"lot_township_zones/FeatureServer/0/query",Object.assign(agsPt(c.lat,c.lng),{returnGeometry:false})).catch(()=>[])]);
      if(co[0]) rec.district={label:"County",value:title(co[0].properties.KEYWORD)+" County"};
      if(lot[0]) rec.facts.unshift(["Historic lot (township)",title(lot[0].properties.KEYWORD)]);
      if(mu[0]) return {name:mu[0].properties.MUNICIPAL1,official:true,source:"PEI municipal zones",areaKm2:mu[0].properties.sq_km_float,geometry:mu[0].geometry};
      return {name:null,official:true,unincorporated:"Unincorporated area",source:"PEI municipal zones"};
    },
    async address(rec){
      try{
        const j=await getJSON(PE_BASE+"civic_addresses/FeatureServer/0/query?"+qs({where:"PID="+parseInt(rec.pid,10),outFields:"STREET_NO,STREET_NM,COMM_NM,FIRE_COV",returnGeometry:false,f:"json"}),10000);
        const a=(j.features||[]).map(f=>f.attributes);
        if(a.length){
          const x=a[0]; if(x.FIRE_COV&&x.FIRE_COV.trim()) rec.facts.push(["Fire coverage",title(x.FIRE_COV)]);
          const osm=await osmAddress(rec.centroid).catch(()=>null);
          return {line:(x.STREET_NO?x.STREET_NO+" ":"")+title(x.STREET_NM)+", "+title(x.COMM_NM),postcode:osm&&osm.postcode,source:"PEI civic addresses",approx:false,more:a.length>1?a.length-1:0};
        }
      }catch(e){}
      return osmAddress(rec.centroid);
    }
  }
};
function recNB(g){
  const p=g.props;
  return {prov:"NB",pid:p.PID,pidFmt:p.PID,geometry:g.geometry,
    area:g.all.reduce((s,x)=>s+(x.Shape_Area||0),0),perim:g.all.reduce((s,x)=>s+(x.Shape_Length||0),0),
    district:{label:"County",value:p.COUNTY?p.COUNTY+" County":null},
    facts:[["Title system",p.Titles_Status],["Gazette notices",p.Gazette_Status==="No Records Returned"?"None":p.Gazette_Status],["Property map sheet",p.PROPERTY_MAP,"mono"],
      ["Map updated",p.LAST_UPDATE&&p.LAST_UPDATE!=="1900-01-01"?p.LAST_UPDATE:null],["Map pieces",g.all.length>1?g.all.length+" polygons":null]]};
}
function recPE(g){
  const p=g.props;
  return {prov:"PE",pid:p.PID,pidFmt:p.PID,geometry:g.geometry,
    area:g.all.reduce((s,x)=>s+(x.Shape__Area||0),0),perim:g.all.reduce((s,x)=>s+(x.Shape__Length||0),0),
    district:{label:"County",value:null},
    facts:[["Map pieces",g.all.length>1?g.all.length+" polygons":null]]};
}
const osmCache=new Map();
async function osmAddress(c){
  const key=c.lat.toFixed(5)+","+c.lng.toFixed(5);
  if(osmCache.has(key)) return osmCache.get(key);
  const j=await getJSON(NOMINATIM+"/reverse?"+qs({lat:c.lat,lon:c.lng,format:"jsonv2",addressdetails:1,zoom:18,"accept-language":"en"}),10000);
  const a=j.address||{};
  const place=a.city||a.town||a.village||a.hamlet||a.municipality||"";
  const street=a.road?((a.house_number?a.house_number+" ":"")+a.road):"";
  const r={line:[street,place].filter(Boolean).join(", ")||null,postcode:a.postcode||null,source:"OpenStreetMap",approx:true};
  osmCache.set(key,r); return r;
}

/* ---- address search ---- */
async function searchAddress(q,prov){
  const jobs=[];
  if(prov==="auto"||prov==="BC") jobs.push(getJSON(BC_GEOCODER+"/addresses.json?"+qs({addressString:q,maxResults:5,outputSRS:4326,locationDescriptor:"parcelPoint",minScore:65}),12000)
    .then(j=>(j.features||[]).filter(f=>["CIVIC_NUMBER","SITE","UNIT","BLOCK"].includes(f.properties.matchPrecision)&&f.properties.fullAddress)
      .map(f=>({label:f.properties.fullAddress,sub:"British Columbia · BC Address Geocoder",prov:"BC",lat:f.geometry.coordinates[1],lng:f.geometry.coordinates[0],score:f.properties.score})))
    .catch(()=>[]));
  jobs.push(getJSON(NOMINATIM+"/search?"+qs({q,format:"jsonv2",countrycodes:"ca",limit:8,addressdetails:1,"accept-language":"en"}),12000)
    .then(list=>list.map(x=>{
      const lat=+x.lat,lng=+x.lon,p=provinceAt(lat,lng);
      return {label:x.display_name.replace(/, Canada$/,""),sub:(p?PROV[p].name:"Outside coverage")+" · OpenStreetMap",prov:p,lat,lng,score:(x.importance||0)*50};
    }).filter(x=>x.prov&&(prov==="auto"||x.prov===prov)))
    .catch(()=>[]));
  const [a,b]=await Promise.all(jobs.length===2?jobs:[Promise.resolve([]),jobs[0]]);
  // Prefer the BC geocoder for BC; drop OSM BC hits when BC geocoder found matches
  const osm=a.length?b.filter(x=>x.prov!=="BC"):b;
  return [...a,...osm].slice(0,8);
}

/* =========================================================
   Preview (demo) data from baked samples
   ========================================================= */
const DEMO_SRC = {
  BC(){const s=SAMPLES.BC; if(!s) return null; const r=recBC(Object.assign({PID:"006620256",OWNER_TYPE:"Private"},s.props),s.geometry);
    r.muniX={name:s.muni.ADMIN_AREA_NAME,official:true,source:"BC municipal boundaries",areaKm2:s.muni.FEATURE_AREA_SQM/1e6};
    r.addrX={line:s.addr.house_number+" "+s.addr.road+", "+s.addr.city,postcode:s.addr.postcode,source:"BC Address Geocoder",approx:false};
    r.neighX=s.neigh.map(([pid,c])=>({pid,geometry:{type:"Polygon",coordinates:c}})); r.insX=s.ins||null; r.devMapX=s.devMap||{}; return r;},
  NB(){const s=SAMPLES.NB; if(!s) return null; const r=recNB({props:s.props,all:[s.props],geometry:s.geometry});
    const lg=s.lg[0]; r.muniX={name:lg.Name,kind:lg.Type_Name,official:true,source:"GeoNB Local Governance",rsc:s.rsc[0]};
    r.addrX={line:[s.addr.road,s.addr.hamlet].filter(Boolean).join(", "),source:"OpenStreetMap",approx:true};
    r.neighX=s.neigh.map(([pid,c])=>({pid,geometry:{type:"Polygon",coordinates:c}})); r.insX=s.ins||null; r.devMapX=s.devMap||{}; r.townX=s.town||null; return r;},
  PE(){const s=SAMPLES.PE; if(!s) return null; const r=recPE({props:{PID:s.props.PID,Shape__Area:s.props.area,Shape__Length:s.props.len},all:[{Shape__Area:s.props.area,Shape__Length:s.props.len}],geometry:s.geometry});
    r.district={label:"County",value:title(s.co[0])+" County"}; r.facts.unshift(["Historic lot (township)",title(s.lot[0])]);
    const cv=s.civ[0]; r.facts.push(["Fire coverage",title(cv.FIRE_COV)]);
    r.muniX={name:s.mu[0].n,official:true,source:"PEI municipal zones",areaKm2:s.mu[0].km};
    r.addrX={line:cv.STREET_NO+" "+title(cv.STREET_NM)+", "+title(cv.COMM_NM),source:"PEI civic addresses",approx:false};
    r.neighX=s.neigh.map(([pid,c])=>({pid,geometry:{type:"Polygon",coordinates:c}})); r.insX=s.ins||null; r.devMapX=s.devMap||{}; return r;}
};
const SAMPLE_PIDS={BC:"006620256",NB:"75000026",PE:"1155506"};
function demoFind(d,prov){
  const hits=[];
  Object.entries(SAMPLE_PIDS).forEach(([p,pid])=>{ if((prov==="auto"||prov===p)&&parseInt(pid,10)===parseInt(d,10)) hits.push(DEMO_SRC[p]()); });
  return hits.filter(Boolean);
}

/* =========================================================
   Maps
   ========================================================= */
const S={rec:null,neighbours:[],muniGeom:null,engine:"osm"};
let lmap=null;
const LG={parcel:null,neigh:null,muni:null,label:null,edges:null};
let street=null,sat=null,satLabels=null;

function ensureLeaflet(){
  if(lmap) return lmap;
  lmap=L.map("map",{zoomControl:true,maxZoom:21,zoomSnap:0.25}).setView([50,-95],4);
  LG.edges=L.layerGroup();
  if(!DEMO){
    street=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:21,maxNativeZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(lmap);
    sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:21,maxNativeZoom:19,attribution:"Imagery © Esri, Maxar, Earthstar Geographics"});
    satLabels=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",{maxZoom:21,maxNativeZoom:19});
    lmap.on("click",e=>identifyAt(e.latlng.lat,e.latlng.lng,lmap.getZoom()));
  } else {
    lmap.attributionControl.addAttribution("Parcel lines: provincial open data");
  }
  lmap.on("zoomend",()=>{ if(!S.rec) return; if(lmap.getZoom()>=16.5) LG.edges.addTo(lmap); else lmap.removeLayer(LG.edges); });
  return lmap;
}
function setBase(kind){
  if(DEMO||!lmap) return;
  if(kind==="sat"){lmap.removeLayer(street);sat.addTo(lmap);satLabels.addTo(lmap);}
  else {lmap.removeLayer(sat);lmap.removeLayer(satLabels);street.addTo(lmap);}
  $("bmStreet").setAttribute("aria-pressed",String(kind!=="sat")); $("bmSat").setAttribute("aria-pressed",String(kind==="sat"));
}
function leafletDraw(fly){
  ensureLeaflet();
  ["parcel","neigh","muni","label"].forEach(k=>{if(LG[k]){lmap.removeLayer(LG[k]);LG[k]=null;}});
  LG.edges.clearLayers();
  const rec=S.rec; if(!rec) return;
  const acc=cssVar("--accent")||"#D9500B", blu=cssVar("--blue")||"#1F5FAD";
  if(S.muniGeom) LG.muni=L.geoJSON(S.muniGeom,{interactive:false,style:{color:blu,weight:2.5,fillColor:blu,fillOpacity:.04}}).addTo(lmap);
  const nb=S.neighbours.filter(n=>!samePid(n.pid,rec));
  if(nb.length) LG.neigh=L.geoJSON({type:"FeatureCollection",features:nb.map(n=>({type:"Feature",geometry:n.geometry,properties:{pid:n.pid}}))},
    {style:f=>neighStyle(f.properties.pid),
     onEachFeature:(f,l)=>{ if(f.properties.pid) l.bindTooltip("PID "+f.properties.pid,{sticky:true});
       if(DEMO) l.on("click",()=>showMsg("info","In preview mode only the three sample lots open. Live search opens any neighbouring lot.")); }}).addTo(lmap);
  LG.parcel=L.geoJSON({type:"Feature",geometry:rec.geometry},{interactive:false,style:{color:acc,weight:3.5,fillColor:acc,fillOpacity:.22}}).addTo(lmap);
  const minL=labelMin(rec);
  rec.sides.slice(0,80).forEach(s=>{ if(s.len<minL) return;
    L.marker([s.mid[1],s.mid[0]],{interactive:false,keyboard:false,icon:L.divIcon({className:"edge-host",html:'<span class="edge-label">'+nf1.format(s.len)+" m</span>",iconSize:[0,0]})}).addTo(LG.edges);});
  if(rec.centroid) LG.label=L.marker([rec.centroid.lat,rec.centroid.lng],{interactive:false,keyboard:false,
    icon:L.divIcon({className:"edge-host",html:'<span class="edge-label" style="background:'+acc+';font-size:12px;padding:5px 7px">'+esc(rec.pidFmt)+"</span>",iconSize:[0,0]})}).addTo(lmap);
  const b=LG.parcel.getBounds();
  if(b.isValid()){
    if(fly&&!reduceMotion()) lmap.flyToBounds(b,{padding:[60,60],maxZoom:19,duration:1.8});
    else lmap.fitBounds(b,{padding:[60,60],maxZoom:19});
  }
  if(lmap.getZoom()>=16.5) LG.edges.addTo(lmap);
}
function labelMin(rec){ const mx=Math.max(0,...rec.sides.map(s=>s.len)); return Math.max(2,mx*0.07); }
function samePid(pid,rec){ return pid!=null && (String(pid)===String(rec.pid)||String(pid)===String(rec.pidFmt)||digits(pid)===digits(rec.pid)); }

/* ---- Google ---- */
const G={ready:false,map:null,parcel:null,neigh:null,muni:null,marks:[],label:null,dir:null,ids:{}};
function googleKey(){ return store.get("pl_gkey")||CFG.googleMapsKey||""; }
function googleMapId(){ return store.get("pl_gmapid")||CFG.googleMapId||""; }
function loadGoogle(key){
  return new Promise((resolve,reject)=>{
    if(window.google&&google.maps&&google.maps.Map) return resolve();
    window.__plGm=()=>resolve();
    window.gm_authFailure=()=>showMsg("err","Google rejected the API key. Check the key, that the Maps JavaScript API is enabled, and that the key allows this website.");
    const s=document.createElement("script");
    s.src="https://maps.googleapis.com/maps/api/js?"+qs({key,v:"weekly",libraries:"geometry,places",callback:"__plGm",loading:"async"});
    s.async=true; s.onerror=()=>reject(new Error("Could not load Google Maps"));
    document.head.appendChild(s);
  });
}
async function enableGoogle(){
  const key=googleKey(); if(!key||DEMO) return false;
  await loadGoogle(key);
  if(!G.ready){
    $("gmap").hidden=false;
    const opts={center:{lat:50,lng:-95},zoom:4,mapTypeId:"hybrid",tilt:45,gestureHandling:"greedy",streetViewControl:true,fullscreenControl:true,mapTypeControl:false,rotateControl:true,clickableIcons:false};
    if(googleMapId()) opts.mapId=googleMapId();
    G.map=new google.maps.Map($("gmap"),opts);
    G.map.addListener("click",e=>identifyAt(e.latLng.lat(),e.latLng.lng(),G.map.getZoom()));
    G.map.addListener("zoom_changed",()=>{const on=G.map.getZoom()>=17; G.marks.forEach(m=>m.setVisible(on));});
    G.ready=true;
  }
  $("engSeg").hidden=false;
  return true;
}
function gClear(){ ["parcel","neigh","muni"].forEach(k=>{if(G[k]){G[k].setMap(null);G[k]=null;}}); G.marks.forEach(m=>m.setMap(null)); G.marks=[]; if(G.label){G.label.setMap(null);G.label=null;} if(G.dir) G.dir.setMap(null); }
function gData(geo,style){ const d=new google.maps.Data({map:G.map}); d.addGeoJson(geo); d.setStyle(style); return d; }
function gDraw(fly){
  if(!G.ready) return; gClear();
  const rec=S.rec; if(!rec) return;
  if(S.muniGeom) G.muni=gData({type:"Feature",geometry:S.muniGeom},{strokeColor:"#5AA9FF",strokeWeight:3,fillOpacity:0,clickable:false});
  const nb=S.neighbours.filter(n=>!samePid(n.pid,rec));
  if(nb.length) G.neigh=gData({type:"FeatureCollection",features:nb.map(n=>({type:"Feature",geometry:n.geometry,properties:{pid:n.pid}}))},{strokeColor:"#F5C518",strokeWeight:1.5,fillOpacity:0,clickable:false});
  G.parcel=gData({type:"Feature",geometry:rec.geometry},{strokeColor:"#FF6A1A",strokeWeight:4,fillColor:"#FF6A1A",fillOpacity:.2,clickable:false});
  const blank={path:google.maps.SymbolPath.CIRCLE,scale:0};
  const minL=labelMin(rec);
  rec.sides.slice(0,80).forEach(s=>{ if(s.len<minL) return;
    G.marks.push(new google.maps.Marker({map:G.map,position:{lat:s.mid[1],lng:s.mid[0]},icon:blank,clickable:false,visible:G.map.getZoom()>=17,
      label:{text:nf1.format(s.len)+" m",color:"#FFFFFF",fontSize:"11px",fontWeight:"600",fontFamily:"IBM Plex Mono, monospace"}}));});
  if(rec.centroid) G.label=new google.maps.Marker({map:G.map,position:rec.centroid,clickable:false,
    label:{text:rec.pidFmt,color:"#FFFFFF",fontSize:"12px",fontWeight:"700"},
    icon:{path:"M-46,-13 L46,-13 L46,13 L6,13 L0,21 L-6,13 L-46,13 Z",fillColor:"#D9500B",fillOpacity:1,strokeWeight:0,scale:1,labelOrigin:new google.maps.Point(0,0),anchor:new google.maps.Point(0,21)}});
  if(fly) gFly(rec); else gFit(rec);
  gBoundaries(); restyleNeighbours(); if(S.scan) drawScan();
}
function gFit(rec){ const b=rec.bbox; G.map.fitBounds({west:b.w,east:b.e,south:b.s,north:b.n},70); }
function gFly(rec){
  const c=rec.centroid; if(!c||reduceMotion()){gFit(rec);return;}
  G.map.setTilt(0); G.map.setHeading(0);
  let z=Math.min(G.map.getZoom()||6,8); G.map.setZoom(z); G.map.panTo(c);
  const step=()=>{ z+=1; G.map.setZoom(z); G.map.panTo(c);
    if(z<18) setTimeout(step,280); else setTimeout(()=>{gFit(rec); setTimeout(()=>G.map.setTilt(45),500);},350); };
  setTimeout(step,400);
}
function gOrbit(){ if(!G.ready) return; G.map.setTilt(45); let h=G.map.getHeading()||0,n=0; const t=setInterval(()=>{h=(h+90)%360;G.map.setHeading(h); if(++n>=4) clearInterval(t);},1600); }
function gBoundaries(){
  if(!googleMapId()||!G.map.getFeatureLayer) return;
  const colors={LOCALITY:"#5AA9FF",POSTAL_CODE:"#B388FF",ADMINISTRATIVE_AREA_LEVEL_2:"#34D399"};
  Object.entries(colors).forEach(([t,col])=>{ let layer; try{layer=G.map.getFeatureLayer(t);}catch(e){return;} if(!layer) return;
    const id=G.ids[t]; layer.style=id?(o=>o.feature.placeId===id?{strokeColor:col,strokeWeight:2.5,strokeOpacity:1,fillColor:col,fillOpacity:.06}:null):null; });
}
async function gGeocode(c){
  const r=await new google.maps.Geocoder().geocode({location:c});
  const out={address:null,postal:null,ids:{}};
  (r.results||[]).forEach(x=>{
    if(!out.address&&(x.types.includes("street_address")||x.types.includes("premise"))) out.address=x.formatted_address.replace(/, Canada$/,"");
    if(x.types.includes("locality")) out.ids.LOCALITY=out.ids.LOCALITY||x.place_id;
    if(x.types.includes("postal_code")){ out.ids.POSTAL_CODE=out.ids.POSTAL_CODE||x.place_id; out.postal=out.postal||x.address_components[0].long_name; }
    if(x.types.includes("administrative_area_level_2")) out.ids.ADMINISTRATIVE_AREA_LEVEL_2=out.ids.ADMINISTRATIVE_AREA_LEVEL_2||x.place_id;
  });
  return out;
}
function setEngine(e){
  S.engine=e;
  $("map").hidden=e!=="osm"; $("gmap").hidden=e!=="google"; $("bmSeg").hidden=e!=="osm"||DEMO;
  $("engOsm").setAttribute("aria-pressed",String(e==="osm")); $("engG").setAttribute("aria-pressed",String(e==="google"));
  if(e==="osm"){ ensureLeaflet(); setTimeout(()=>{lmap.invalidateSize(); leafletDraw(false);},30); } else gDraw(false);
}
function draw(fly){ if(S.engine==="google"&&G.ready) gDraw(fly); else leafletDraw(fly); }

/* =========================================================
   Views
   ========================================================= */
function showView(v){
  document.body.dataset.view=v;
  $("homeView").hidden=v!=="home"; $("resultView").hidden=v!=="result";
  if(v==="result"){ ensureLeaflet(); setTimeout(()=>lmap.invalidateSize(),50); }
  window.scrollTo(0,0);
}
const $body=()=>$("panelBody");
function showMsg(kind,html){
  let m=$("flashMsg");
  if(!m){ m=document.createElement("div"); m.id="flashMsg"; $("panel").insertBefore(m,$("panelBody")); }
  m.className="msg "+kind; m.innerHTML=html; m.hidden=false;
  clearTimeout(showMsg.t); if(kind==="info") showMsg.t=setTimeout(()=>{m.hidden=true;},6000);
}
function clearMsg(){ const m=$("flashMsg"); if(m) m.hidden=true; }

function progress(steps){
  $body().innerHTML='<div class="progress" role="status" aria-live="polite">'+steps.map((s,i)=>`<div class="p" id="st${i}"><span class="dot"></span><span>${esc(s)}</span></div>`).join("")+"</div>";
  return {
    run(i){const e=$("st"+i); if(e) e.className="p run";},
    done(i){const e=$("st"+i); if(e) e.className="p done";},
    skip(i){const e=$("st"+i); if(e) e.className="p skip";}
  };
}

/* ---------------- search flow ---------------- */
let busy=false;
function runSearch(raw,prov){
  const q=String(raw||"").trim(); if(!q) return;
  const hasLetters=/[a-z]/i.test(q);
  if(!hasLetters&&digits(q).length>=4) return lookupPid(digits(q),prov||"auto");
  if(hasLetters) return lookupAddress(q,prov||"auto");
  showView("result"); $body().innerHTML=""; showMsg("warn","A PID has at least 4 digits. For an address, include the street name.");
}

async function lookupPid(d,prov){
  if(busy) return; busy=true; clearMsg();
  showView("result");
  const where=prov==="auto"?"BC, New Brunswick and PEI":PROV[prov].name;
  const pr=progress(["Searching "+where+" for PID "+d,"Official municipality","Address","Neighbouring lots"]);
  pr.run(0);
  try{
    let found=[],errors=[];
    if(DEMO){ found=demoFind(d,prov); }
    else{
      const order=prov==="auto"?provOrder(d):[prov];
      const settled=await Promise.allSettled(order.map(p=>LIVE[p].byPid(d)));
      settled.forEach((s,i)=>{ if(s.status==="fulfilled") found.push(...s.value); else errors.push(PROV[order[i]].short); });
      found=found.filter(r=>r.geometry);
    }
    if(!found.length){
      $body().innerHTML="";
      if(DEMO) showMsg("warn","Preview mode holds three sample lots: <b>006-620-256</b> (BC), <b>75000026</b> (NB) and <b>1155506</b> (PEI). On the hosted site, any PID in these provinces works.");
      else if(errors.length) showMsg("err","We couldn't reach the "+errors.join(", ")+" land records just now. Check your connection and try again.");
      else showMsg("warn","No lot with PID <b>"+esc(d)+"</b> in "+where+". Check the digits against your tax notice or title, or pick the province. Condo units in BC may not be mapped separately; try the street address.");
      return;
    }
    pr.done(0);
    if(found.length>1){ busy=false; return choose(found,"This number matches "+found.length+" lots. Which one?"); }
    await open(found[0],pr);
  }catch(e){ $body().innerHTML=""; showMsg("err","Something went wrong: "+esc(e.message)); }
  finally{ busy=false; }
}

async function lookupAddress(q,prov){
  if(busy) return; busy=true; clearMsg();
  showView("result");
  if(DEMO){ $body().innerHTML=""; showMsg("warn","Address search needs the live site. In preview mode, open one of the sample PIDs."); busy=false; return; }
  const pr=progress(["Looking up the address","Finding the lot at that address"]);
  pr.run(0);
  try{
    const hits=await searchAddress(q,prov);
    pr.done(0);
    if(!hits.length){ $body().innerHTML=""; showMsg("warn","No matching address in BC, New Brunswick or PEI. Add the town, for example “611 Sanderson Rd, Parksville”."); return; }
    if(hits.length===1){ busy=false; return pickAddress(hits[0]); }
    $body().innerHTML=`<div class="card"><div class="rhead"><div class="k">Pick the address</div><p class="sentence">We found ${hits.length} matches for “${esc(q)}”.</p></div>
      <ul class="pick">${hits.map((h,i)=>`<li><button type="button" data-i="${i}"><span><span class="m">${esc(h.label)}</span><br><span class="s">${esc(h.sub)}</span></span><span aria-hidden="true">→</span></button></li>`).join("")}</ul></div>`;
    $body().querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>pickAddress(hits[+b.dataset.i]));
  }catch(e){ $body().innerHTML=""; showMsg("err","Address search failed: "+esc(e.message)); }
  finally{ busy=false; }
}
async function pickAddress(h){
  if(busy) return; busy=true;
  const pr=progress(["Finding the lot at "+h.label,"Official municipality","Address","Neighbouring lots"]);
  pr.run(0);
  try{
    const list=(await LIVE[h.prov].at(h.lat,h.lng)).filter(r=>r.geometry);
    if(!list.length){ $body().innerHTML=""; showMsg("warn","That address point falls on a road or open land, so no lot matched. Zoom the map in and click the lot instead."); ensureLeaflet(); lmap.setView([h.lat,h.lng],18); return; }
    pr.done(0);
    const withPid=list.filter(r=>r.pid), pick=withPid.length?withPid:list;
    if(pick.length>1){ busy=false; return choose(pick,"Several lots overlap at this address (strata or air-space parcels). Which one?"); }
    await open(pick[0],pr);
  }catch(e){ $body().innerHTML=""; showMsg("err","Couldn't reach the "+PROV[h.prov].short+" land records: "+esc(e.message)); }
  finally{ busy=false; }
}
async function identifyAt(lat,lng,zoom){
  if(DEMO) return;
  const p=provinceAt(lat,lng);
  if(!p){ showMsg("warn","Lots can be opened in BC, New Brunswick and PEI. Zoom into one of those provinces."); return; }
  if(zoom<14){ showMsg("info","Zoom in to street level, then click a single lot."); return; }
  if(busy) return; busy=true; clearMsg();
  try{
    const list=(await LIVE[p].at(lat,lng)).filter(r=>r.geometry);
    if(!list.length){ showMsg("info","No lot there. It may be a road or water."); return; }
    const withPid=list.filter(r=>r.pid), pick=withPid.length?withPid:list;
    busy=false;
    if(pick.length>1) return choose(pick,"Several lots overlap here (strata or air-space parcels). Which one?");
    const pr=progress(["Lot found","Official municipality","Address","Neighbouring lots"]); pr.done(0);
    busy=true; await open(pick[0],pr);
  }catch(e){ showMsg("err","Couldn't reach the "+PROV[p].short+" land records: "+esc(e.message)); }
  finally{ busy=false; }
}
function choose(list,msg){
  $body().innerHTML=`<div class="card"><div class="rhead"><div class="k">Choose a lot</div><p class="sentence">${esc(msg)}</p></div>
    <ul class="pick">${list.map((r,i)=>`<li><button type="button" data-i="${i}"><span><span class="m" style="font-family:var(--mono)">${esc(r.pidFmt)}</span><br><span class="s">${esc(PROV[r.prov].name)}${r.area?" · "+fmtAcres(r.area):""}</span></span><span aria-hidden="true">→</span></button></li>`).join("")}</ul></div>`;
  $body().querySelectorAll("[data-i]").forEach(b=>b.onclick=async()=>{ if(busy) return; busy=true; const pr=progress(["Lot selected","Official municipality","Address","Neighbouring lots"]); pr.done(0); try{ await open(list[+b.dataset.i],pr);} finally{busy=false;} });
}

/* =========================================================
   Land insights: ownership type, development status, value &
   sales (NB), hazards, area scan for undeveloped lots
   ========================================================= */
const OSM_BLD="https://services6.arcgis.com/Do88DoK2xjTUCXd1/arcgis/rest/services/OSM_Buildings_NA/FeatureServer/0/query";
const NB_BLD="https://geonb.snb.ca/arcgis/rest/services/GeoNB_SNB_Buildings/MapServer/0/query";
const NB_CIV="https://geonb.snb.ca/arcgis/rest/services/GeoNB_DPS_Civic_Address/MapServer/0/query";
const NB_CROWN="https://geonb.snb.ca/arcgis/rest/services/GeoNB_DNR_Crown_Land/MapServer/3/query";
const NB_FLOOD="https://geonb.snb.ca/arcgis/rest/services/GeoNB_ENV_Flood/MapServer/2/query";
const NB_ASSESS="https://gnb.socrata.com/resource/r46k-5j2j.json";
const PE_CIV=PE_BASE+"civic_addresses/FeatureServer/0/query";
const PE_CLUI=PE_BASE+"CLUI2020/FeatureServer/8/query";
const PE_WET=PE_BASE+"Base_2025/Wetlands/MapServer/0/query";
const CLSS="https://proxyinternet.nrcan-rncan.gc.ca/arcgis/rest/services/CLSS-SATC/CLSS_Administrative_Boundaries/MapServer/0/query";
const CDEM="https://geogratis.gc.ca/services/elevation/cdem/altitude";
const BC_ALR="pub:WHSE_LEGAL_ADMIN_BOUNDARIES.OATS_ALR_POLYS";
const BC_FLOODPLAIN="pub:WHSE_BASEMAPPING.CWB_FLOODPLAINS_BC_AREA_SVW";
const BC_FIRES="pub:WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_FIRE_POLYS_SP";
const BC_RESERVES="pub:WHSE_ADMIN_BOUNDARIES.CLAB_INDIAN_RESERVES";
const BC_PARKS="pub:WHSE_TANTALIS.TA_PARK_ECORES_PA_SVW";
const BC_SCHOOL="pub:WHSE_TANTALIS.TA_SCHOOL_DISTRICTS_SVW";

/* ---- geometry helpers ---- */
function inRing(p,r){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];if(((yi>p[1])!==(yj>p[1]))&&(p[0]<(xj-xi)*(p[1]-yi)/((yj-yi)||1e-18)+xi))c=!c;}return c;}
function inGeom(p,g){
  if(!g) return false;
  const polys=g.type==="Polygon"?[g.coordinates]:g.type==="MultiPolygon"?g.coordinates:[];
  return polys.some(poly=>inRing(p,poly[0])&&!poly.slice(1).some(h=>inRing(p,h)));
}
function geomArea(g){
  const polys=g.type==="Polygon"?[g.coordinates]:g.type==="MultiPolygon"?g.coordinates:[];
  let tot=0;
  polys.forEach(poly=>poly.forEach((ring,i)=>{
    const lat0=ring[0][1], kx=111320*Math.cos(rad(lat0)), ky=110574;
    let a=0; for(let k=0,j=ring.length-1;k<ring.length;j=k++) a+=(ring[j][0]*kx)*(ring[k][1]*ky)-(ring[k][0]*kx)*(ring[j][1]*ky);
    tot+=(i===0?1:-1)*Math.abs(a/2);
  }));
  return tot;
}
const ptAgs=(c,extra)=>Object.assign(agsPt(c.lat,c.lng),{returnGeometry:false},extra||{});
const soql=async params=>getJSON(NB_ASSESS+"?"+qs(params),15000);
const title2=s=>title(String(s||"").trim());

/* ---- buildings & addresses in a box ---- */
async function buildingPoints(prov,b){
  const jobs=[ags(OSM_BLD,Object.assign(agsBox(b),{outFields:"objectid",resultRecordCount:2000})).then(l=>l.map(f=>({f,src:"OpenStreetMap"}))).catch(()=>[])];
  if(prov==="NB") jobs.push(ags(NB_BLD,Object.assign(agsBox(b),{outFields:"OBJECTID"})).then(l=>l.map(f=>({f,src:"GeoNB building survey"}))).catch(()=>[]));
  const out=[];
  (await Promise.all(jobs)).flat().forEach(({f,src})=>{const c=f.geometry&&centroid(f.geometry); if(c) out.push({p:[c.lng,c.lat],src});});
  return out;
}
async function addressPoints(prov,b){
  try{
    if(prov==="BC"){
      const j=await getJSON(BC_GEOCODER+"/sites/within.json?"+qs({bbox:[b.w,b.s,b.e,b.n].join(","),maxResults:1000,outputSRS:4326,locationDescriptor:"parcelPoint"}),15000);
      return (j.features||[]).map(f=>({p:f.geometry.coordinates,label:(f.properties.fullAddress||"").replace(/, BC$/,"")}));
    }
    if(prov==="NB"){
      const l=await ags(NB_CIV,Object.assign(agsBox(b),{outFields:"CIVIC_NUM,STREET,ST_TYPE_E,COMMUNITY,PID,STRUCT_E"}));
      return l.filter(f=>f.geometry).map(f=>{const p=f.properties;return {p:f.geometry.coordinates,pid:p.PID,label:[p.CIVIC_NUM,title2(p.STREET),title2(p.ST_TYPE_E)].filter(Boolean).join(" ")+(p.COMMUNITY?", "+title2(p.COMMUNITY):""),kind:p.STRUCT_E?title2(p.STRUCT_E):null};});
    }
    if(prov==="PE"){
      const l=await ags(PE_CIV,Object.assign(agsBox(b),{outFields:"STREET_NO,STREET_NM,COMM_NM,PID,INFO"}));
      return l.filter(f=>f.geometry).map(f=>{const p=f.properties;return {p:f.geometry.coordinates,pid:p.PID,label:(p.STREET_NO?p.STREET_NO+" ":"")+title2(p.STREET_NM)+", "+title2(p.COMM_NM),kind:peInfo(p.INFO)};});
    }
  }catch(e){}
  return [];
}
const PE_INFO={SFD:"Single-family home",MFD:"Multi-family home",SEA:"Seasonal cottage",COM:"Commercial",FRM:"Farm",BRN:"Barn",APT:"Apartment",MOB:"Mobile home",IND:"Industrial",INS:"Institutional",CHU:"Church",GAR:"Garage"};
function peInfo(code){ const c=String(code||"").trim(); return c?(PE_INFO[c]||title(c)):null; }
const PE_LANDUSE={AGR:"Agriculture",FOR:"Forest",RES:"Residential",COM:"Commercial",IND:"Industrial",INT:"Institutional",REC:"Recreation",TRN:"Transportation",URB:"Urban",WET:"Wetland",NON:"No active use",WAT:"Water"};

function devStatus(geom,pid,bpts,apts){
  const bb=bounds(geom);
  const inside=pt=>pt.p[0]>=bb.w&&pt.p[0]<=bb.e&&pt.p[1]>=bb.s&&pt.p[1]<=bb.n&&inGeom(pt.p,geom);
  const b=bpts.filter(inside);
  const a=apts.filter(x=>inside(x)||(pid!=null&&x.pid!=null&&parseInt(x.pid,10)===parseInt(digits(pid),10)));
  return {status:(b.length||a.length)?"developed":"undeveloped",buildings:b.length,addresses:a};
}

/* ---- per-province checks ---- */
async function checksBC(rec){
  const c=rec.centroid, P="SRID=4326;POINT("+c.lng+" "+c.lat+")";
  const q=(layer,cql,max,props)=>wfs(layer,cql,max,props).catch(()=>null);
  const [alr,fp,fires,res,park,sd]=await Promise.all([
    q(BC_ALR,"INTERSECTS(GEOMETRY,"+P+")",1,"STATUS"),
    q(BC_FLOODPLAIN,"DWITHIN(GEOMETRY,"+P+",100,meters)",1,"FLOODPLAIN_NAME,DESIGNATION_DATE"),
    q(BC_FIRES,"DWITHIN(SHAPE,"+P+",2000,meters)",100,"FIRE_YEAR,FIRE_SIZE_HECTARES"),
    q(BC_RESERVES,"DWITHIN(GEOMETRY,"+P+",1000,meters)",3,"ENGLISH_NAME"),
    q(BC_PARKS,"DWITHIN(SHAPE,"+P+",1000,meters)",3,"PROTECTED_LANDS_NAME,PROTECTED_LANDS_DESIGNATION"),
    q(BC_SCHOOL,"INTERSECTS(SHAPE,"+P+")",1,"SCHOOL_DISTRICT_NAME,SCHOOL_DISTRICT_NUMBER")]);
  const risks=[], facts=[];
  if(alr) risks.push(alr.length?{lvl:"flag",t:"Inside the Agricultural Land Reserve",d:"Farming is the priority use. Subdividing or building non-farm uses needs Agricultural Land Commission approval."}
                                :{lvl:"ok",t:"Not in the Agricultural Land Reserve"});
  if(fp) risks.push(fp.length?{lvl:"flag",t:"Within 100 m of a designated floodplain",d:(fp[0].properties.FLOODPLAIN_NAME||"Provincial floodplain map")}
                              :{lvl:"ok",t:"Not near a designated floodplain",d:"Provincial floodplain maps cover selected rivers only."});
  if(fires){ if(fires.length){ const yrs=fires.map(f=>+f.properties.FIRE_YEAR).filter(Boolean); risks.push({lvl:yrs.some(y=>y>=2000)?"flag":"info",t:`${fires.length} past wildfire${fires.length>1?"s":""} within 2 km`,d:"Most recent in "+Math.max(...yrs)+"."}); }
             else risks.push({lvl:"ok",t:"No recorded wildfire within 2 km"}); }
  if(res&&res.length) risks.push({lvl:"info",t:"First Nations reserve within 1 km",d:[...new Set(res.map(f=>f.properties.ENGLISH_NAME))].join(", ")});
  if(park&&park.length) risks.push({lvl:"info",t:"Park or protected area within 1 km",d:[...new Set(park.map(f=>f.properties.PROTECTED_LANDS_NAME))].join(", ")});
  if(sd&&sd[0]) facts.push(["School district","SD "+sd[0].properties.SCHOOL_DISTRICT_NUMBER+" ("+sd[0].properties.SCHOOL_DISTRICT_NAME+")"]);
  const ot=rec.ownerType;
  const owner={type:ot||"Not recorded",source:"ParcelMap BC",
    note:ot==="Private"?"Owned by a person, company or organisation. Names are held by the Land Title Office.":ot?"Public or First Nations land. Contact the managing government for details.":null};
  return {risks,facts,owner};
}
async function checksNB(rec){
  const c=rec.centroid;
  const [crown,flood,clss,assess]=await Promise.all([
    ags(NB_CROWN,ptAgs(c,{outFields:"*"})).catch(()=>null),
    ags(NB_FLOOD,ptAgs(c,{outFields:"DESCR"})).catch(()=>null),
    ags(CLSS,ptAgs(c,{outFields:"adminAreaNameEng",distance:1000,units:"esriSRUnit_Meter"})).catch(()=>null),
    soql({"$select":"pan,location,descript,ta_desc,assess_yr,assess_val,trans_date,sale_val,tax_levy,shape_area","$where":`intersects(the_geom,'POINT(${c.lng} ${c.lat})')`,"$limit":3}).catch(()=>null)]);
  const risks=[], facts=[];
  if(flood) risks.push(flood.length?{lvl:"flag",t:"Inside a mapped flood hazard area",d:flood[0].properties.DESCR||"Provincial flood hazard map"}
                                    :{lvl:"ok",t:"Outside mapped flood hazard areas",d:"Provincial flood maps cover the main river valleys."});
  if(clss&&clss.length) risks.push({lvl:"info",t:"First Nations reserve within 1 km",d:[...new Set(clss.map(f=>f.properties.adminAreaNameEng))].join(", ")});
  else if(clss) risks.push({lvl:"ok",t:"No First Nations reserve within 1 km"});
  const owner=crown&&crown.length?{type:"Crown land (provincial)",source:"GeoNB Crown land map",note:"Managed by the New Brunswick Department of Natural Resources."}
                                 :{type:crown?"Not Crown land":"Unknown",source:"GeoNB Crown land map",note:crown?"Private or other ownership. New Brunswick doesn't publish the owner type for other land.":null};
  let value=null;
  if(assess&&assess.length){
    const a=assess[0];
    value={pan:a.pan,descript:title2(a.descript),town:a.ta_desc,year:a.assess_yr,val:+a.assess_val||null,saleDate:a.trans_date?a.trans_date.slice(0,10):null,sale:+a.sale_val||null,tax:+a.tax_levy||null,area:+a.shape_area||null,location:title2(a.location),source:"SNB property assessment (open data)"};
  }
  return {risks,facts,owner,value};
}
async function checksPE(rec){
  const c=rec.centroid, b=rec.bbox;
  const [clui,wet,fn,sd,fd]=await Promise.all([
    ags(PE_CLUI,ptAgs(c,{outFields:"LANDUSE,SUBUSE"})).catch(()=>null),
    ags(PE_WET,Object.assign(agsBox(b),{returnGeometry:true,outFields:"LANDUSE"})).catch(()=>null),
    ags(PE_BASE+"first_nations_reserves_zones/FeatureServer/0/query",ptAgs(c,{outFields:"NAME",distance:1000,units:"esriSRUnit_Meter"})).catch(()=>null),
    ags(PE_BASE+"school_district_zones/FeatureServer/0/query",ptAgs(c,{outFields:"DISTRICT,KEYWORD"})).catch(()=>null),
    ags(PE_BASE+"fire_district_zones/FeatureServer/0/query",ptAgs(c,{outFields:"DISTRICT,KEYWORD"})).catch(()=>null)]);
  const risks=[], facts=[];
  if(wet){
    const hit=wet.filter(w=>w.geometry&&outerRings(rec.geometry)[0].some(p=>inGeom(p,w.geometry))||(w.geometry&&inGeom([c.lng,c.lat],w.geometry)));
    risks.push(hit.length?{lvl:"flag",t:"Wetland on this lot",d:"Work in or near wetlands needs a provincial permit."}
      :wet.length?{lvl:"info",t:"Wetland next to this lot",d:"A 30 m buffer usually applies to work near wetlands."}:{lvl:"ok",t:"No mapped wetland on or next to this lot"});
  }
  if(fn&&fn.length) risks.push({lvl:"info",t:"First Nations land within 1 km",d:fn.map(f=>f.properties.NAME).join(", ")});
  if(sd&&sd[0]) facts.push(["School district",title2(sd[0].properties.DISTRICT||sd[0].properties.KEYWORD)]);
  if(fd&&fd[0]) facts.push(["Fire district",title2(fd[0].properties.DISTRICT||fd[0].properties.KEYWORD)]);
  const lu=clui&&clui[0]?PE_LANDUSE[clui[0].properties.LANDUSE]||clui[0].properties.LANDUSE:null;
  return {risks,facts,landUse:lu,owner:{type:"Not published",source:"Government of PEI",note:"PEI doesn't publish ownership type in its open parcel data."}};
}
const CHECKS={BC:checksBC,NB:checksNB,PE:checksPE};

async function elevationAt(c){
  try{ const j=await getJSON(CDEM+"?"+qs({lat:c.lat,lon:c.lng}),8000); return j&&j.altitude!=null?j.altitude:null; }catch(e){ return null; }
}

/* ---- load insights for the open parcel ---- */
async function loadInsights(rec){
  if(DEMO){ rec.ins=rec.insX||null; S.devMap=rec.devMapX||{}; return rec.ins; }
  const pad=padBounds(rec.bbox);
  const [chk,elev,bpts,apts]=await Promise.all([
    CHECKS[rec.prov](rec).catch(()=>({risks:[],facts:[],owner:null})),
    elevationAt(rec.centroid),
    buildingPoints(rec.prov,pad),
    addressPoints(rec.prov,pad)]);
  const dev=devStatus(rec.geometry,rec.pid,bpts,apts);
  if(rec.prov==="NB"&&chk.value&&/VACANT|TERRAIN VAC|^LAND$|^LOT$|TIMBER|WOOD|FARM|BOIS/i.test(chk.value.descript||"")&&!dev.buildings) dev.assessNote=chk.value.descript;
  const devMap={};
  S.neighbours.forEach(n=>{ if(!n.pid||devMap[n.pid]) return; const d=devStatus(n.geometry,n.pid,bpts,apts); devMap[n.pid]={status:d.status,area:geomArea(n.geometry)}; });
  rec.ins=Object.assign({},chk,{elev,dev:{status:dev.status,buildings:dev.buildings,addresses:dev.addresses.map(a=>({label:a.label,kind:a.kind||null})).slice(0,6),assessNote:dev.assessNote||null},landUse:chk.landUse||null});
  S.devMap=devMap;
  window.__plLast={prov:rec.prov,pid:rec.pid,ins:rec.ins,devMap};
  return rec.ins;
}

/* ---- render insights ---- */
const ICON={flag:"⚠",ok:"✓",info:"ℹ"};
function chipsHTML(rec){
  const i=rec.ins; if(!i) return `<span class="chip2 wait">Checking land records…</span>`;
  const out=[];
  if(i.owner&&i.owner.type&&i.owner.type!=="Not published"&&i.owner.type!=="Unknown") out.push(`<span class="chip2">${esc(i.owner.type)}${/land|Crown/i.test(i.owner.type)?"":" land"}</span>`);
  if(i.dev) out.push(i.dev.status==="developed"?`<span class="chip2">Developed</span>`:`<span class="chip2 green">No buildings on record</span>`);
  if(i.landUse) out.push(`<span class="chip2">${esc(i.landUse)}</span>`);
  (i.risks||[]).filter(r=>r.lvl==="flag").forEach(r=>out.push(`<span class="chip2 warn">⚠ ${esc(r.t.replace(/^Inside (a |the )?/,"").replace(/^Within 100 m of a /,"Near "))}</span>`));
  if(i.value&&i.value.val) out.push(`<span class="chip2">Assessed $${nf0.format(i.value.val)}</span>`);
  return out.join("")||"";
}
function landPane(rec){
  const i=rec.ins, P=PROV[rec.prov], c=rec.centroid;
  if(!i) return `<div class="muted">Checking ownership, buildings, hazards and value…</div>`;
  const o=i.owner||{}, d=i.dev||{}, v=i.value;
  const ownerLinks={
    BC:`<a class="btn ghost sm" href="https://explorer.ltsa.ca/" target="_blank" rel="noopener">Title search, LTSA ($11.06) ↗</a><a class="btn ghost sm" href="https://www2.gov.bc.ca/gov/content/housing-tenancy/real-estate-bc/land-owner-transparency-registry" target="_blank" rel="noopener">Company &amp; trust owners (free) ↗</a>`,
    NB:`<a class="btn ghost sm" href="${PROV.NB.registry.url}" target="_blank" rel="noopener">Title search, SNB PLANET ↗</a>`,
    PE:`<a class="btn ghost sm" href="${PROV.PE.registry.url}" target="_blank" rel="noopener">Registry search, GeoLinc Plus ↗</a>`}[rec.prov];
  const assessLink={BC:"https://www.bcassessment.ca/",NB:"https://paol-efel.snb.ca/paol.html",PE:"https://www.princeedwardisland.ca/en/topic/property-assessment"}[rec.prov];
  const taxSale={BC:"https://www2.gov.bc.ca/gov/content/governments/local-governments/finance/requisition-taxation/municipal-property-tax-sale",NB:"https://www2.gnb.ca/content/gnb/en/departments/finance/taxes/tax_sale/properties.html",PE:null}[rec.prov];
  const realtor=c?`https://www.realtor.ca/map#ZoomLevel=16&Center=${c.lat.toFixed(5)}%2C${c.lng.toFixed(5)}`:null;
  const facts=[["Elevation",i.elev!=null?nf0.format(i.elev)+" m above sea level":null],...(i.facts||[]),["Land use",i.landUse]].filter(f=>f[1]);
  return `
  <section class="lsec"><div class="k">Ownership</div>
    <div class="big">${esc(o.type||"Unknown")}</div>
    ${o.note?`<div class="muted">${esc(o.note)}</div>`:""}
    <div class="muted">Owner names aren't in open data. They come from the land registry, one title at a time, for a fee.</div>
    <div class="row">${ownerLinks}</div></section>
  <section class="lsec"><div class="k">Buildings &amp; use</div>
    <div class="big">${d.status==="developed"?"Developed":"No buildings or address on record"}</div>
    <div class="muted">${d.status==="developed"?[d.buildings?d.buildings+" building"+(d.buildings>1?"s":"")+" mapped":null,d.addresses&&d.addresses.length?d.addresses.length+" civic address"+(d.addresses.length>1?"es":""):null].filter(Boolean).join(" · "):"Likely vacant or undeveloped. Building maps can miss sheds, new builds and rural structures, so check the satellite view."}${d.assessNote?" · Assessment lists it as "+esc(d.assessNote.toLowerCase()):""}</div>
    ${d.addresses&&d.addresses.length?`<ul class="list">${d.addresses.map(a=>`<li><span>${esc(a.label)}</span><span class="t">${esc(a.kind||"")}</span></li>`).join("")}</ul>`:""}
  </section>
  ${v?`<section class="lsec"><div class="k">Assessment &amp; last sale</div>
    <dl class="facts">
      <div><dt>Assessed value (${esc(v.year)})</dt><dd>${v.val?"$"+nf0.format(v.val):"–"}</dd></div>
      <div><dt>Property tax</dt><dd>${v.tax?"$"+nf2.format(v.tax)+" / year":"–"}</dd></div>
      <div><dt>Last sale</dt><dd>${v.sale?"$"+nf0.format(v.sale):"–"}</dd></div>
      <div><dt>Sale date</dt><dd>${esc(v.saleDate||"–")}</dd></div>
      <div><dt>Described as</dt><dd>${esc(v.descript||"–")}</dd></div>
      <div><dt>Assessment account</dt><dd class="mono">PAN ${esc(v.pan)}</dd></div>
    </dl>
    <div class="muted">From Service New Brunswick's assessment records for this location${v.area&&Math.abs(v.area-rec.area)/rec.area>0.25?`. The account covers ${fmtAcres(v.area)}, so it may include more than this PID`:""}.</div></section>`:""}
  <section class="lsec"><div class="k">Hazards &amp; restrictions</div>
    <ul class="checks">${(i.risks||[]).map(r=>`<li class="${r.lvl}"><span class="ic" aria-hidden="true">${ICON[r.lvl]}</span><span><b>${esc(r.t)}</b>${r.d?`<br><span class="muted">${esc(r.d)}</span>`:""}</span></li>`).join("")||'<li class="info"><span class="ic">ℹ</span><span>No hazard layers available here.</span></li>'}</ul></section>
  ${facts.length?`<dl class="facts">${facts.map(f=>`<div><dt>${esc(f[0])}</dt><dd>${esc(f[1])}</dd></div>`).join("")}${facts.length%2?"<div></div>":""}</dl>`:""}
  <section class="lsec"><div class="k">Value &amp; for sale</div>
    <div class="row">
      ${realtor?`<a class="btn ghost sm" href="${realtor}" target="_blank" rel="noopener">Listings near here (REALTOR.ca) ↗</a>`:""}
      <a class="btn ghost sm" href="${assessLink}" target="_blank" rel="noopener">Assessment lookup ↗</a>
      ${taxSale?`<a class="btn ghost sm" href="${taxSale}" target="_blank" rel="noopener">Tax sale properties ↗</a>`:""}
    </div></section>`;
}
function areaSummaryHTML(rec){
  const m=S.devMap||{}; const ids=Object.keys(m).filter(k=>!samePid(k,rec));
  if(!ids.length) return "";
  const und=ids.filter(k=>m[k].status==="undeveloped");
  const undArea=und.reduce((s,k)=>s+(m[k].area||0),0);
  return `<div class="stat3"><div><div class="n">${ids.length}</div><div class="muted">lots around this one</div></div>
    <div><div class="n green">${und.length}</div><div class="muted">no buildings on record</div></div>
    <div><div class="n">${fmtAcres(undArea).replace(" acres","")}</div><div class="muted">acres undeveloped</div></div></div>
    <div class="muted">Green lots on the map have no mapped building or civic address.</div>`;
}

/* ---- area scan (map view) ---- */
async function scanArea(){
  if(DEMO){ showMsg("info","Area scans run on the hosted site."); return; }
  const m=S.engine==="google"&&G.ready?G.map:lmap;
  let b=null;
  if(m===lmap){ if(lmap.getZoom()>=15){ const bb=lmap.getBounds(); b={w:bb.getWest(),e:bb.getEast(),s:bb.getSouth(),n:bb.getNorth()}; } }
  else if(G.map.getZoom()>=15&&G.map.getBounds()){ const bb=G.map.getBounds(); const ne=bb.getNorthEast(), sw=bb.getSouthWest(); b={w:sw.lng(),e:ne.lng(),s:sw.lat(),n:ne.lat()}; }
  if(!b||(b.e-b.w)>0.04){
    if(!S.rec){ showMsg("info","Zoom in to street level (a few blocks across), then scan."); return; }
    const c0=S.rec.centroid, dLat=450/111320, dLng=450/(111320*Math.cos(rad(c0.lat)));
    b={w:c0.lng-dLng,e:c0.lng+dLng,s:c0.lat-dLat,n:c0.lat+dLat};
    if(m===lmap) lmap.fitBounds([[b.s,b.w],[b.n,b.e]]); else G.map.fitBounds({west:b.w,east:b.e,south:b.s,north:b.n});
  }
  const c={lat:(b.s+b.n)/2,lng:(b.w+b.e)/2}, prov=provinceAt(c.lat,c.lng);
  if(!prov){ showMsg("warn","Area scans work in BC, New Brunswick and PEI."); return; }
  const out=$("scanOut"); if(out) out.innerHTML='<div class="muted">Scanning lots, buildings and addresses in view…</div>';
  try{
    const [parcels,bpts,apts]=await Promise.all([LIVE[prov].neighbours(b),buildingPoints(prov,b),addressPoints(prov,b)]);
    const seen=new Map();
    parcels.forEach(p=>{ if(!p.pid||seen.has(p.pid)) return; const d=devStatus(p.geometry,p.pid,bpts,apts); seen.set(p.pid,{pid:p.pid,geometry:p.geometry,status:d.status,area:geomArea(p.geometry)}); });
    const all=[...seen.values()], und=all.filter(x=>x.status==="undeveloped").sort((a,b2)=>b2.area-a.area);
    S.scan={prov,all};
    drawScan();
    if(out) out.innerHTML=`<div class="stat3"><div><div class="n">${all.length}</div><div class="muted">lots in view</div></div>
      <div><div class="n green">${und.length}</div><div class="muted">no buildings on record</div></div>
      <div><div class="n">${all.length?Math.round(und.length/all.length*100):0}%</div><div class="muted">of lots in view</div></div></div>
      ${parcels.length>=300?'<div class="muted">Only the first 300 lots were checked. Zoom in for a complete count.</div>':""}
      ${und.length?`<div class="k" style="margin-top:6px">Largest undeveloped lots in view</div>
      <div class="tblwrap"><table><thead><tr><th>PID</th><th style="text-align:right">Size</th><th></th></tr></thead><tbody>
      ${und.slice(0,25).map(x=>`<tr><td class="id">${esc(x.pid)}</td><td class="num">${fmtAcres(x.area)}</td><td style="text-align:right"><button class="btn ghost sm" type="button" data-open2="${esc(x.pid)}" style="padding:4px 10px">Open</button></td></tr>`).join("")}
      </tbody></table></div>`:""}`;
    if(out) out.querySelectorAll("[data-open2]").forEach(btn=>btn.onclick=()=>lookupPid(digits(btn.dataset.open2),prov));
  }catch(e){ if(out) out.innerHTML='<div class="msg err">The scan failed: '+esc(e.message)+'. Try a smaller area.</div>'; }
}
function drawScan(){
  if(!S.scan) return;
  const und=S.scan.all.filter(x=>x.status==="undeveloped");
  if(lmap){ if(LG.scan) lmap.removeLayer(LG.scan);
    LG.scan=L.geoJSON({type:"FeatureCollection",features:und.map(x=>({type:"Feature",geometry:x.geometry,properties:{pid:x.pid,area:x.area}}))},
      {style:{color:"#1E8A5A",weight:1.4,fillColor:"#2BB673",fillOpacity:.32},onEachFeature:(f,l)=>{l.bindTooltip("PID "+f.properties.pid+" · "+fmtAcres(f.properties.area)+" · no buildings on record",{sticky:true});}}).addTo(lmap); }
  if(G.ready){ if(G.scan) G.scan.setMap(null);
    G.scan=gData({type:"FeatureCollection",features:und.map(x=>({type:"Feature",geometry:x.geometry,properties:{}}))},{strokeColor:"#2BB673",strokeWeight:1.5,fillColor:"#2BB673",fillOpacity:.3,clickable:false}); }
}

/* ---- municipality land statistics (New Brunswick open assessment data) ---- */
const NB_VACANT=/VACANT|^LAND$|^LOT$|^TERRAIN$|TERRAIN VAC|LOT VAC/i;
const NB_RESOURCE=/TIMBER|WOOD|BOIS|FARM|FORET|FOREST|AGRIC|BLUEBERR|BLEUET/i;
async function nbTownStats(town){
  const [groups,sales]=await Promise.all([
    soql({"$select":"descript,count(*) as n,sum(assess_val) as v","$where":`ta_desc='${town.replace(/'/g,"''")}'`,"$group":"descript","$limit":5000}),
    soql({"$select":"pan,location,descript,trans_date,sale_val,assess_val,shape_area","$where":`ta_desc='${town.replace(/'/g,"''")}' AND sale_val > 1000 AND trans_date > '${new Date(Date.now()-730*864e5).toISOString().slice(0,10)}'`,"$order":"trans_date DESC","$limit":25})]);
  let total=0,vac=0,res=0,vacVal=0;
  groups.forEach(g=>{const n=+g.n; total+=n; if(NB_VACANT.test(g.descript||"")){vac+=n;vacVal+=+g.v||0;} else if(NB_RESOURCE.test(g.descript||"")) res+=n;});
  return {town,total,vac,res,vacVal,sales};
}
async function showTownStats(rec){
  const out=$("townOut"); if(!out) return;
  if(!rec.ins&&rec._insP){ out.innerHTML='<div class="muted">Loading…</div>'; await rec._insP.catch(()=>{}); }
  const town=rec.ins&&rec.ins.value&&rec.ins.value.town; if(!town){ out.innerHTML='<div class="muted">No assessment area found for this lot.</div>'; return; }
  out.innerHTML='<div class="muted">Counting properties in '+esc(town)+'…</div>';
  try{
    const s=DEMO?rec.townX:await nbTownStats(town);
    if(!s){ out.innerHTML='<div class="muted">Town statistics run on the hosted site.</div>'; return; }
    if(!DEMO) window.__plLast.town=s;
    out.innerHTML=`<div class="k">${esc(s.town)} · all assessed properties</div>
      <div class="stat3"><div><div class="n">${nf0.format(s.total)}</div><div class="muted">property accounts</div></div>
      <div><div class="n green">${nf0.format(s.vac)}</div><div class="muted">vacant land or lots</div></div>
      <div><div class="n">${nf0.format(s.res)}</div><div class="muted">timber, wood or farm land</div></div></div>
      ${s.sales&&s.sales.length?`<div class="k" style="margin-top:6px">Sales in the last 2 years</div>
      <div class="tblwrap"><table><thead><tr><th>Where</th><th>Date</th><th style="text-align:right">Price</th></tr></thead><tbody>
      ${s.sales.map(x=>`<tr><td>${esc(title2(x.location))}<br><span class="muted">${esc(title2(x.descript))}</span></td><td class="id">${esc((x.trans_date||"").slice(0,10))}</td><td class="num">$${nf0.format(+x.sale_val)}</td></tr>`).join("")}
      </tbody></table></div>`:""}
      <div class="muted">Source: Service New Brunswick property assessment open data. Owner names are not included.</div>`;
  }catch(e){ out.innerHTML='<div class="msg err">Couldn\'t load town statistics: '+esc(e.message)+'</div>'; }
}

/* ---------------- open a parcel ---------------- */
async function open(rec,pr){
  rec.centroid=centroid(rec.geometry); rec.bbox=bounds(rec.geometry); rec.sides=sides(rec.geometry);
  let muni,addr,neigh;
  if(DEMO){
    muni=rec.muniX; addr=rec.addrX; neigh=rec.neighX;
    [1,2,3].forEach(i=>pr.done(i));
  } else {
    const src=LIVE[rec.prov];
    [1,2,3].forEach(i=>pr.run(i));
    const pM=src.muni(rec).catch(()=>null).then(v=>{pr.done(1);return v;});
    const pA=src.address(rec).catch(()=>null).then(v=>{pr.done(2);return v;});
    const pN=src.neighbours(padBounds(rec.bbox)).catch(()=>[]).then(v=>{pr.done(3);return v;});
    [muni,addr,neigh]=await Promise.all([pM,pA,pN]);
  }
  rec.muni=muni||{name:null,official:false};
  rec.addr=addr||{};
  if(G.ready&&rec.centroid){ try{ const g=await gGeocode(rec.centroid); G.ids=g.ids; if(!rec.addr.line&&g.address) rec.addr={line:g.address,source:"Google",approx:true}; if(!rec.addr.postcode&&g.postal) rec.addr.postcode=g.postal; }catch(e){} }
  S.rec=rec; S.neighbours=neigh||[]; S.muniGeom=(rec.muni&&rec.muni.geometry)||null;
  $("lgMuni").hidden=!S.muniGeom;
  S.devMap={}; S.scan=null; if(LG.scan&&lmap){lmap.removeLayer(LG.scan);LG.scan=null;} if(G.scan){G.scan.setMap(null);G.scan=null;}
  render(rec);
  draw(true);
  remember(rec);
  rec._insP=loadInsights(rec); rec._insP.then(()=>{ if(S.rec===rec) refreshInsights(rec); }).catch(()=>{});
  try{ const h="#"+rec.prov.toLowerCase()+"-"+digits(rec.pid); if(location.hash!==h) history.pushState(null,"",h); }catch(e){}
  document.title=rec.pidFmt+" · ParcelLine";
}

function refreshInsights(rec){
  const ch=$("chips"); if(ch) ch.innerHTML=chipsHTML(rec);
  const lp=$("t5"); if(lp) lp.innerHTML=landPane(rec);
  const as=$("areaSum"); if(as) as.innerHTML=areaSummaryHTML(rec);
  const tb=$("townBox"); if(tb) tb.hidden=!(rec.prov==="NB"&&rec.ins&&rec.ins.value&&rec.ins.value.town);
  const tbb=$("townBtn"); if(tbb&&rec.ins&&rec.ins.value) tbb.textContent="Land statistics for "+rec.ins.value.town;
  restyleNeighbours();
}
function neighStyle(pid){
  const d=S.devMap&&S.devMap[pid];
  if(d&&d.status==="undeveloped") return {color:"#1E8A5A",weight:1.6,dashArray:"5 4",fillColor:"#2BB673",fillOpacity:.28};
  return {color:"#C99A06",weight:1.6,dashArray:"5 4",fillColor:"#C99A06",fillOpacity:DEMO?.05:0};
}
function restyleNeighbours(){
  if(LG.neigh) LG.neigh.setStyle(f=>neighStyle(f.properties.pid));
  if(G.ready&&G.neigh) G.neigh.setStyle(f=>{const st=neighStyle(f.getProperty("pid")); return {strokeColor:st.color==="#1E8A5A"?"#2BB673":"#F5C518",strokeWeight:1.5,fillColor:"#2BB673",fillOpacity:st.color==="#1E8A5A"?.3:0,clickable:false};});
}

/* ---------------- render ---------------- */
function muniLabel(m){
  if(!m) return "Unknown";
  if(m.name) return m.name;
  return m.unincorporated||"Not in a municipality";
}
function sentence(rec){
  const P=PROV[rec.prov], m=rec.muni||{};
  let size="";
  if(rec.area){ const a=acres(rec.area); size=`<strong>${a<10?nf2.format(a):nf1.format(a)}-acre</strong> (${nf0.format(rec.area)} m²) `; }
  const dist=rec.district&&rec.district.value?rec.district.value:null;
  const where=m.name
    ? `in the <strong>${esc(m.name)}</strong>${dist?", "+esc(dist):""}`
    : `outside any municipality${dist?" in "+esc(dist):""}`;
  return `PID <strong>${esc(rec.pidFmt)}</strong> is a ${size}lot ${where}, ${esc(P.name)}.`;
}
function render(rec){
  const P=PROV[rec.prov], m=rec.muni||{}, a=rec.addr||{}, c=rec.centroid;
  const nav=c?`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=driving`:null;
  const walk=c?`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=walking`:null;
  const gm=c?`https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`:null;
  const sv=c?`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${c.lat},${c.lng}`:null;
  const earth=c?`https://earth.google.com/web/search/${c.lat},${c.lng}`:null;
  const muniSub=[m.kind,m.areaKm2?nf1.format(m.areaKm2)+" km²":null].filter(Boolean).join(" · ");
  const facts=[
    ["Province",P.name],
    [rec.district.label,rec.district.value],
    ["Regional service commission",m.rsc],
    ...rec.facts.filter(f=>/Historic lot/.test(f[0])),
    ["Area",rec.area?nf0.format(rec.area)+" m² · "+nf2.format(rec.area/10000)+" ha":null],
    ["Square feet",rec.area?nf0.format(rec.area*10.7639)+" ft²":null],
    ["Perimeter",rec.perim?fmtLen(rec.perim):null],
    ["Number of sides",rec.sides.length||null],
    ...rec.facts.filter(f=>!/Historic lot/.test(f[0])),
    ["Centre point",c?c.lat.toFixed(6)+", "+c.lng.toFixed(6):null,"mono wide"]
  ].filter(f=>f[1]!=null&&f[1]!=="");
  const narrow=facts.filter(f=>!(f[2]||"").includes("wide"));
  if(narrow.length%2) narrow[narrow.length-1][2]=((narrow[narrow.length-1][2]||"")+" wide");

  $body().innerHTML=`
  <article class="card">
    <div class="rhead">
      <div class="row1"><div class="pidbig">${esc(rec.pidFmt)}</div><span class="badge">${esc(P.short)} · ${esc(P.idName)}</span></div>
      <p class="sentence">${sentence(rec)}</p>
      <div class="chips" id="chips">${chipsHTML(rec)}</div>
    </div>
    <div class="tiles">
      <div class="tile"><div class="k">Municipality</div><div class="v">${esc(muniLabel(m))}</div>${muniSub?`<div class="s">${esc(muniSub)}</div>`:""}
        <div class="official ${m.official?"":"approx"}">${m.official?"✓ Official boundary":"Approximate"}</div></div>
      <div class="tile"><div class="k">Lot size</div><div class="v">${rec.area?esc(fmtAcres(rec.area)):"–"}</div><div class="s">${rec.area?nf0.format(rec.area)+" m²":""}</div></div>
      <div class="tile"><div class="k">Address</div><div class="v">${esc(a.line||"No street address")}</div><div class="s">${esc([a.postcode,a.approx?"nearest address":null].filter(Boolean).join(" · "))}</div></div>
    </div>
    <div class="quick">
      ${nav?`<a class="btn sm" href="${nav}" target="_blank" rel="noopener">Directions ↗</a>`:""}
      ${DEMO?"":`<button class="btn ghost sm" type="button" id="shareBtn">Copy link</button>`}
      <button class="btn ghost sm" type="button" id="copyBtn">Copy details</button>
      <button class="btn ghost sm" type="button" id="flyBtn">Fly to lot</button>
      ${G.ready?`<button class="btn ghost sm" type="button" id="orbitBtn">Orbit</button>`:""}
    </div>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected="true" data-tab="t1" id="tb1">Details</button>
      <button role="tab" aria-selected="false" data-tab="t5" id="tb5">Land</button>
      <button role="tab" aria-selected="false" data-tab="t2" id="tb2">Boundary</button>
      <button role="tab" aria-selected="false" data-tab="t3" id="tb3">Area</button>
      <button role="tab" aria-selected="false" data-tab="t4" id="tb4">Visit</button>
    </div>
    <div class="tabpane" id="t1" role="tabpanel">
      <dl class="facts">${facts.map(f=>`<div class="${(f[2]||"").includes("wide")?"wide":""}"><dt>${esc(f[0])}</dt><dd class="${(f[2]||"").includes("mono")?"mono":""}" ${(f[2]||"").includes("elev")?'id="elev"':""}>${esc(f[1])}</dd></div>`).join("")}</dl>
      <div class="muted">Municipality from ${esc(m.source||"–")}${a.source?` · address from ${esc(a.source)}`:""}.${m.website?` <a href="${esc(m.website)}" target="_blank" rel="noopener">Municipal website ↗</a>`:""}</div>
    </div>
    <div class="tabpane" id="t5" role="tabpanel" hidden>${landPane(rec)}</div>
    <div class="tabpane" id="t2" role="tabpanel" hidden>${boundaryPane(rec)}</div>
    <div class="tabpane" id="t3" role="tabpanel" hidden>
      <div id="areaSum">${areaSummaryHTML(rec)}</div>
      <div class="lsec"><div class="k">Find undeveloped land</div>
        <div class="muted">Scan every lot in the current map view. Lots with no mapped building or civic address turn green.</div>
        <div class="row"><button class="btn sm" type="button" id="scanBtn2">Scan the map view</button></div>
        <div id="scanOut"></div></div>
      <div class="lsec" id="townBox" hidden><div class="k">Town land statistics</div>
        <div class="muted">Vacant land counts and recent sale prices from New Brunswick's open assessment records.</div>
        <div class="row"><button class="btn ghost sm" type="button" id="townBtn">Load town statistics</button></div>
        <div id="townOut"></div></div>
      <div class="k">Neighbouring lots</div>
      <div class="nbwrap">${neighbourPane(rec)}</div>
    </div>
    <div class="tabpane" id="t4" role="tabpanel" hidden>
      <div class="visit">
        <div class="row">${nav?`<a class="btn sm" href="${nav}" target="_blank" rel="noopener">Drive here ↗</a><a class="btn ghost sm" href="${walk}" target="_blank" rel="noopener">Walk ↗</a>`:""}
          ${sv?`<a class="btn ghost sm" href="${sv}" target="_blank" rel="noopener">Street View ↗</a>`:""}${earth?`<a class="btn ghost sm" href="${earth}" target="_blank" rel="noopener">Google Earth 3D ↗</a>`:""}
          ${gm?`<a class="btn ghost sm" href="${gm}" target="_blank" rel="noopener">Google Maps ↗</a>`:""}</div>
        <div class="row"><a class="btn ghost sm" href="${P.viewer.url}" target="_blank" rel="noopener">${esc(P.viewer.label)} ↗</a><a class="btn ghost sm" href="${P.registry.url}" target="_blank" rel="noopener">${esc(P.registry.label)} ↗</a></div>
        ${G.ready?googleVisitHTML():`<div class="muted">${DEMO?"Directions inside the page, Street View and nearby places are available on the hosted site with Google Maps switched on.":"Switch on Google Maps features (gear icon, top right) for directions inside this page, Street View, elevation and nearby places."}</div>`}
      </div>
    </div>
  </article>
  <div class="muted">Boundary and measurements are approximate and are not a legal survey.</div>`;

  // tabs
  const tabs=[...$body().querySelectorAll("[role=tab]")];
  tabs.forEach(t=>t.onclick=()=>{ tabs.forEach(x=>{x.setAttribute("aria-selected",String(x===t)); $(x.dataset.tab).hidden=x!==t;}); if(t.dataset.tab==="t4") googleVisitInit(rec); if(t.dataset.tab==="t3"){ const np=$("t3").querySelector(".nbwrap"); if(np) np.innerHTML=neighbourPane(rec);} });
  $("flyBtn").onclick=()=>{ if(S.engine==="google"&&G.ready) gFly(rec); else { lmap.setView([rec.centroid.lat,rec.centroid.lng],7,{animate:false}); setTimeout(()=>leafletDraw(true),60);} };
  if($("orbitBtn")) $("orbitBtn").onclick=gOrbit;
  if($("shareBtn")) $("shareBtn").onclick=ev=>copyText(location.href.split("#")[0]+"#"+rec.prov.toLowerCase()+"-"+digits(rec.pid),ev.target,"Link copied");
  $("copyBtn").onclick=ev=>copyText(plainText(rec,facts),ev.target,"Copied");
  const dl=$("dlBtn"); if(dl) dl.onclick=()=>download(rec);
  $body().querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>lookupPid(digits(b.dataset.open),rec.prov));
  $("scanBtn2").onclick=scanArea;
  if($("townBtn")) $("townBtn").onclick=()=>showTownStats(S.rec||rec);
  if(rec.ins) refreshInsights(rec);
}
function boundaryPane(rec){
  if(!rec.sides.length) return '<div class="muted">No boundary geometry.</div>';
  const lens=rec.sides.map(s=>s.len);
  return `<div class="muted">${rec.sides.length} sides. Longest ${fmtLen(Math.max(...lens))}, shortest ${fmtLen(Math.min(...lens))}. Side lengths also appear on the map when you zoom in.</div>
    <div class="tblwrap"><table><thead><tr><th>Side</th><th style="text-align:right">Metres</th><th style="text-align:right">Feet</th><th style="text-align:right">Direction</th></tr></thead><tbody>
    ${rec.sides.map((s,i)=>`<tr><td class="id">${i+1}</td><td class="num">${nf2.format(s.len)}</td><td class="num">${nf1.format(s.len*3.28084)}</td><td class="num">${nf0.format(s.brg)}° ${compass(s.brg)}</td></tr>`).join("")}
    </tbody></table></div>
    ${DEMO?"":`<div><button class="btn ghost sm" type="button" id="dlBtn">Download boundary (GeoJSON)</button></div>`}`;
}
function neighbourPane(rec){
  const c=rec.centroid;
  const uniq=[...new Map(S.neighbours.filter(n=>n.pid&&!samePid(n.pid,rec)&&!/^0+\d?$/.test(digits(n.pid))).map(n=>[n.pid,n])).values()]
    .map(n=>{const nc=centroid(n.geometry); const dv=S.devMap&&S.devMap[n.pid]; return {pid:n.pid,d:nc&&c?dist([c.lng,c.lat],[nc.lng,nc.lat]):null,st:dv?dv.status:null};})
    .sort((a,b)=>(a.d??1e9)-(b.d??1e9)).slice(0,40);
  if(!uniq.length) return '<div class="muted">No neighbouring lots found nearby.</div>';
  return `<div class="muted">${uniq.length} lots around this one, nearest first.</div>
    <div class="tblwrap"><table><thead><tr><th>PID</th><th>Status</th><th style="text-align:right">Distance</th><th></th></tr></thead><tbody>
    ${uniq.map(n=>`<tr><td class="id">${esc(n.pid)}</td><td>${n.st==="undeveloped"?'<span class="chip2 green">No buildings</span>':n.st==="developed"?'<span class="muted">Developed</span>':""}</td><td class="num">${n.d!=null?fmtLen(n.d):"–"}</td><td style="text-align:right">${DEMO?"":`<button class="btn ghost sm" type="button" data-open="${esc(n.pid)}" style="padding:4px 10px">Open</button>`}</td></tr>`).join("")}
    </tbody></table></div>`;
}
function googleVisitHTML(){
  return `<div class="card" style="padding:12px;display:grid;gap:8px">
      <div class="k">Directions on this page</div>
      <div class="row"><input class="field" id="origin" type="text" placeholder="Starting address or city" style="flex:1 1 180px">
        <select class="field" id="mode" aria-label="Travel mode"><option value="DRIVING">Drive</option><option value="WALKING">Walk</option><option value="BICYCLING">Cycle</option><option value="TRANSIT">Transit</option></select></div>
      <div class="row"><button class="btn sm" type="button" id="routeBtn">Get route</button><button class="btn ghost sm" type="button" id="meBtn">From my location</button></div>
      <div id="routeOut" class="muted"></div><div id="routeSteps"></div></div>
    <div class="k">Street View <span id="svMeta" class="muted" style="text-transform:none;letter-spacing:0;font-weight:400"></span></div>
    <div id="svbox"></div>
    <div class="k">Nearby within 3 km</div>
    <ul class="list" id="nearList"><li class="muted">Loading…</li></ul>`;
}
function googleVisitInit(rec){
  if(!G.ready||rec._visitInit) return; rec._visitInit=true;
  const c=rec.centroid;
  const sv=new google.maps.StreetViewService();
  sv.getPanorama({location:c,radius:120,source:google.maps.StreetViewSource.OUTDOOR}).then(r=>{
    const loc=r.data.location.latLng, heading=google.maps.geometry.spherical.computeHeading(loc,new google.maps.LatLng(c.lat,c.lng));
    new google.maps.StreetViewPanorama($("svbox"),{pano:r.data.location.pano,pov:{heading,pitch:0},addressControl:false,motionTracking:false});
    $("svMeta").textContent="· camera "+Math.round(google.maps.geometry.spherical.computeDistanceBetween(loc,new google.maps.LatLng(c.lat,c.lng)))+" m from the lot centre";
  }).catch(()=>{ $("svbox").outerHTML='<div class="muted">No Street View imagery within 120 m of this lot.</div>'; });
  google.maps.importLibrary("places").then(async({Place,SearchNearbyRankPreference})=>{
    const {places}=await Place.searchNearby({fields:["displayName","location","primaryTypeDisplayName"],locationRestriction:{center:c,radius:3000},
      includedPrimaryTypes:["school","hospital","supermarket","pharmacy","bus_station","park","gas_station","restaurant"],maxResultCount:12,rankPreference:SearchNearbyRankPreference.DISTANCE});
    const ul=$("nearList");
    ul.innerHTML=(places||[]).length?places.map(p=>`<li><span>${esc(p.displayName)}<br><span class="t">${esc(p.primaryTypeDisplayName||"")}</span></span><span class="t">${fmtLen(google.maps.geometry.spherical.computeDistanceBetween(p.location,new google.maps.LatLng(c.lat,c.lng)))}</span></li>`).join(""):'<li class="muted">Nothing found within 3 km.</li>';
  }).catch(()=>{ const ul=$("nearList"); if(ul) ul.innerHTML='<li class="muted">Turn on Places API (New) for the key to list nearby places.</li>'; });
  const out=$("routeOut"), steps=$("routeSteps");
  const run=async origin=>{
    out.textContent="Finding a route…"; steps.innerHTML="";
    try{
      if(!G.dir) G.dir=new google.maps.DirectionsRenderer({polylineOptions:{strokeColor:"#5AA9FF",strokeWeight:6}});
      G.dir.setMap(G.map); G.dir.setPanel(steps);
      const mode=$("mode").value;
      const r=await new google.maps.DirectionsService().route({origin,destination:c,travelMode:google.maps.TravelMode[mode]});
      G.dir.setDirections(r);
      const leg=r.routes[0].legs[0];
      out.innerHTML=`<b style="color:var(--ink);font-size:15px">${esc(leg.duration.text)} · ${esc(leg.distance.text)}</b>`;
      if(S.engine!=="google") setEngine("google");
    }catch(e){ out.innerHTML="No route from here ("+esc(e.code||e.message)+"). The <b>Drive here</b> button above opens Google Maps directions instead."; }
  };
  $("routeBtn").onclick=()=>{const o=$("origin").value.trim(); if(!o){out.textContent="Type where you're starting from.";return;} run(o);};
  $("meBtn").onclick=()=>{ out.textContent="Getting your location…";
    if(!navigator.geolocation){out.textContent="Location isn't available in this browser. Type a starting address.";return;}
    navigator.geolocation.getCurrentPosition(p=>run({lat:p.coords.latitude,lng:p.coords.longitude}),()=>{out.textContent="Location permission was declined. Type a starting address instead.";},{timeout:10000}); };
}
function plainText(rec,facts){
  const m=rec.muni||{}, a=rec.addr||{};
  return [`PID ${rec.pidFmt} (${PROV[rec.prov].name})`,`Municipality: ${muniLabel(m)}`,a.line?`Address: ${a.line}${a.postcode?" "+a.postcode:""}`:"",
    ...facts.filter(f=>!(f[2]||"").includes("elev")).map(f=>`${f[0]}: ${f[1]}`),
    rec.sides.length?`Sides (m): ${rec.sides.map(s=>nf2.format(s.len)).join(", ")}`:"",
    `Link: ${location.href.split("#")[0]}#${rec.prov.toLowerCase()}-${digits(rec.pid)}`].filter(Boolean).join("\n");
}
async function copyText(t,btn,ok){
  const old=btn.textContent;
  try{ await navigator.clipboard.writeText(t); btn.textContent=ok; }
  catch(e){ btn.textContent="Copy blocked"; }
  setTimeout(()=>{btn.textContent=old;},1600);
}
function download(rec){
  const gj={type:"FeatureCollection",features:[{type:"Feature",geometry:rec.geometry,properties:{pid:rec.pidFmt,province:rec.prov,municipality:muniLabel(rec.muni),area_m2:rec.area,sides_m:rec.sides.map(s=>+s.len.toFixed(2))}}]};
  try{
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([JSON.stringify(gj,null,2)],{type:"application/geo+json"}));
    a.download="parcel-"+rec.prov+"-"+digits(rec.pid)+".geojson"; document.body.appendChild(a); a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
  }catch(e){ showMsg("warn","Downloads are blocked here. Use Copy details instead."); }
}

/* ---------------- recent searches ---------------- */
function remember(rec){
  try{
    const list=JSON.parse(store.get("pl_recent")||"[]").filter(x=>!(x.p===rec.prov&&x.d===digits(rec.pid)));
    list.unshift({p:rec.prov,d:digits(rec.pid),l:rec.pidFmt,m:muniLabel(rec.muni)});
    store.set("pl_recent",JSON.stringify(list.slice(0,5)));
  }catch(e){}
  renderRecent();
}
function renderRecent(){
  let list=[]; try{ list=JSON.parse(store.get("pl_recent")||"[]"); }catch(e){}
  const el=$("recent"); if(!el) return;
  if(!list.length){ el.hidden=true; return; }
  el.hidden=false;
  el.innerHTML="<span>Recent</span>"+list.map((x,i)=>`<button type="button" class="chip" data-r="${i}" title="${esc(x.m)}">${esc(x.l)}</button>`).join("");
  el.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{const x=list[+b.dataset.r]; lookupPid(x.d,x.p);});
}

/* ---------------- home: plan drawings ---------------- */
function planSVG(sample,opts){
  const o=Object.assign({w:480,h:300,label:true},opts||{});
  const all=[sample.geometry.coordinates[0],...sample.neigh.map(n=>n[1][0])];
  const pc=sample.geometry.coordinates[0];
  let w=180,e=-180,s=90,n=-90; pc.forEach(([x,y])=>{w=Math.min(w,x);e=Math.max(e,x);s=Math.min(s,y);n=Math.max(n,y);});
  const lat0=(s+n)/2, kx=Math.cos(rad(lat0));
  const spanX=(e-w)*kx, spanY=(n-s), span=Math.max(spanX,spanY*1.0)*2.4;
  const cx=(w+e)/2, cy=(s+n)/2;
  const sc=Math.min(o.w,o.h)/span;
  const P=([x,y])=>[(o.w/2+(x-cx)*kx*sc).toFixed(1),(o.h/2-(y-cy)*sc).toFixed(1)];
  const path=r=>"M"+r.map(p=>P(p).join(",")).join("L")+"Z";
  const neigh=sample.neigh.map(nn=>`<path d="${path(nn[1][0])}" fill="none" stroke="var(--plan-line)" stroke-width="1.2"/>`).join("");
  const main=`<path d="${path(pc)}" fill="var(--accent)" fill-opacity=".18" stroke="var(--accent)" stroke-width="2.6" stroke-linejoin="round"/>`;
  return `<svg viewBox="0 0 ${o.w} ${o.h}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Lot outline"><rect width="${o.w}" height="${o.h}" fill="var(--plan-bg)"/>${neigh}${main}</svg>`;
}
function renderHome(){
  if(SAMPLES.BC) $("heroPlan").innerHTML=planSVG(SAMPLES.BC,{w:480,h:300});
  const cards=[
    {p:"BC",pid:"006-620-256",m:"City of Parksville",meta:"Regional District of Nanaimo · 0.80 acres"},
    {p:"NB",pid:"75000026",m:"Municipality of Lakeland Ridges",meta:"York County · 1.36 acres"},
    {p:"PE",pid:"1155506",m:"Town of Three Rivers",meta:"Kings County · 17.2 acres"}
  ];
  $("sampleCards").innerHTML=cards.map(c=>`<button type="button" class="scard" data-sample="${c.p}">
    <div class="thumb">${SAMPLES[c.p]?planSVG(SAMPLES[c.p],{w:400,h:250}):""}</div>
    <div class="body"><div class="k">${esc(PROV[c.p].name)}</div><div class="pid">${esc(c.pid)}</div><div class="muni">${esc(c.m)}</div><div class="meta">${esc(c.meta)}</div></div></button>`).join("");
  document.querySelectorAll("[data-sample]").forEach(b=>b.onclick=()=>{const p=b.dataset.sample; lookupPid(SAMPLE_PIDS[p],p);});
  renderRecent();
}

/* ---------------- settings ---------------- */
function openSettings(){
  $("gkey").value=store.get("pl_gkey"); $("gmapid").value=store.get("pl_gmapid");
  const d=$("settings"); if(d.showModal) d.showModal(); else d.setAttribute("open","");
}
async function saveSettings(){
  const k=$("gkey").value.trim(); store.set("pl_gkey",k); store.set("pl_gmapid",$("gmapid").value.trim());
  $("settings").close();
  if(DEMO){ showView("result"); $body().innerHTML=""; showMsg("info","Google Maps features run on the hosted site. Your key was saved in this browser."); return; }
  if(!k) return;
  try{ await enableGoogle(); if(S.rec){ setEngine("google"); gDraw(true); render(S.rec);} else showMsg("info","Google Maps is on. Search for a lot to try the 3D view."); }
  catch(e){ showMsg("err",esc(e.message)); }
}

/* ---------------- routing ---------------- */
function routeFromHash(){
  const h=(location.hash||"").slice(1).match(/^(bc|nb|pe)-(\d+)$/i);
  if(h){ lookupPid(h[2],h[1].toUpperCase()); return true; }
  return false;
}

/* ---------------- init ---------------- */
function init(){
  document.body.dataset.view="home";
  if(DEMO) $("demoBanner").hidden=false;
  renderHome();
  $("heroForm").addEventListener("submit",e=>{e.preventDefault(); runSearch($("heroQ").value,$("heroProv").value);});
  $("topForm").addEventListener("submit",e=>{e.preventDefault(); runSearch($("topQ").value,"auto");});
  $("home").onclick=()=>{ try{history.pushState(null,"",location.pathname+location.search);}catch(e){} showView("home"); document.title="ParcelLine"; };
  $("backBtn").onclick=$("home").onclick;
  $("whereBtn").onclick=()=>{const b=$("whereBox"); b.hidden=!b.hidden; $("whereBtn").setAttribute("aria-expanded",String(!b.hidden));};
  $("bmStreet").onclick=()=>setBase("street"); $("bmSat").onclick=()=>setBase("sat");
  $("engOsm").onclick=()=>setEngine("osm"); $("engG").onclick=()=>{ if(G.ready) setEngine("google"); };
  $("scanBtn").onclick=()=>{ const t=$("tb3"); if(t) t.click(); scanArea(); };
  if(DEMO) $("scanBtn").hidden=true;
  $("openSettings").onclick=openSettings; $("gsave").onclick=saveSettings;
  $("gforget").onclick=()=>{ store.del("pl_gkey"); store.del("pl_gmapid"); $("gkey").value=""; $("gmapid").value=""; };
  if(DEMO) $("bmSeg").hidden=true;
  window.addEventListener("popstate",()=>{ if(!routeFromHash()) showView("home"); });
  if(!DEMO&&googleKey()) enableGoogle().catch(()=>{});
  routeFromHash();
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();
