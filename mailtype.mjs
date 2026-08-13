import dns from 'node:dns/promises';

const GOOGLE_DOH='https://dns.google/resolve';
const DISPOSABLE_URL='https://disposable.github.io/disposable-email-domains/domains_mx.txt';
let disposableSet=null, disposableUpdatedAt=null, disposableError=null;

function normalizeDomain(input=''){
 let s=String(input).trim().toLowerCase();
 if(s.includes('@')) s=s.slice(s.lastIndexOf('@')+1);
 s=s.replace(/\.$/,'');
 if(!s||s.length>253||!s.includes('.')||!/^[a-z0-9.-]+$/i.test(s)) throw new Error('invalid_email_or_domain');
 return s;
}
async function doh(name,type){
 const r=await fetch(`${GOOGLE_DOH}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`,{headers:{accept:'application/dns-json','user-agent':'MAILTYPE/1.0'}});
 if(!r.ok)throw new Error('doh_failed');
 const j=await r.json();
 if(j.Status===3){const e=new Error('NXDOMAIN');e.code='ENOTFOUND';throw e}
 return j.Answer||[];
}
async function resolveMx(name){
 try{return (await dns.resolveMx(name)).map(x=>({priority:x.priority,exchange:x.exchange.replace(/\.$/, '')})).sort((a,b)=>a.priority-b.priority)}
 catch(e){
  if(e.code==='ENOTFOUND')throw e;
  const a=await doh(name,'MX');
  return a.map(x=>{const m=String(x.data).match(/^(\d+)\s+(.+)$/);return m?{priority:+m[1],exchange:m[2].replace(/\.$/,'')}:{priority:0,exchange:String(x.data).replace(/\.$/,'')}}).sort((x,y)=>x.priority-y.priority);
 }
}
async function resolveTxt(name){
 try{return (await dns.resolveTxt(name)).map(parts=>parts.join(''))}
 catch(e){
  if(e.code==='ENOTFOUND')throw e;
  try{return (await doh(name,'TXT')).map(x=>String(x.data).replace(/^"|"$/g,'').replace(/"\s*"/g,''))}
  catch(e2){if(e2.code==='ENOTFOUND')throw e2;return []}
 }
}
async function existsAny(domain){
 for(const type of ['A','AAAA','NS']){
  try{
   const vals= type==='A'?await dns.resolve4(domain):type==='AAAA'?await dns.resolve6(domain):await dns.resolveNs(domain);
   if(vals?.length)return true;
  }catch(e){
   if(e.code==='ENOTFOUND') return false;
   try{const vals=await doh(domain,type);if(vals.length)return true}catch(e2){if(e2.code==='ENOTFOUND')return false}
  }
 }
 return null;
}
function provider(mx=[]){
 const h=mx.map(x=>x.exchange.toLowerCase()).join(' ');
 if(!h)return 'UNKNOWN';
 if(/google\.com|googlemail\.com/.test(h))return 'GOOGLE';
 if(/protection\.outlook\.com|mail\.protection\.outlook\.com/.test(h))return 'MICROSOFT_365';
 if(/pphosted\.com|proofpoint/.test(h))return 'PROOFPOINT';
 if(/mimecast/.test(h))return 'MIMECAST';
 if(/zoho/.test(h))return 'ZOHO';
 if(/messagingengine\.com|fastmail/.test(h))return 'FASTMAIL';
 if(/amazonses\.com|awsapps\.com/.test(h))return 'AMAZON';
 if(/secureserver\.net/.test(h))return 'GODADDY';
 return 'OTHER';
}
function txtFinding(records,prefix){
 const matches=records.filter(x=>x.toLowerCase().startsWith(prefix.toLowerCase()));
 return {status:matches.length?'PRESENT':'MISSING',records:matches};
}
async function mtaSts(domain){
 let txt=[];
 try{txt=await resolveTxt(`_mta-sts.${domain}`)}catch(e){if(e.code==='ENOTFOUND')return {status:'MISSING',record:null,policy:'UNKNOWN'}}
 const rec=txt.find(x=>/^v=STSv1\b/i.test(x));
 if(!rec)return {status:'MISSING',record:null,policy:'UNKNOWN'};
 let policy='UNKNOWN',mode=null;
 try{
  const r=await fetch(`https://mta-sts.${domain}/.well-known/mta-sts.txt`,{redirect:'follow',signal:AbortSignal.timeout(4000),headers:{'user-agent':'MAILTYPE/1.0'}});
  if(r.ok){
   const text=(await r.text()).slice(0,20000);
   const vm=/^\s*version:\s*STSv1\s*$/im.test(text);
   const mm=text.match(/^\s*mode:\s*(enforce|testing|none)\s*$/im);
   if(vm&&mm){policy='VALID';mode=mm[1].toLowerCase()} else policy='INVALID';
  }else policy='UNREACHABLE';
 }catch{policy='UNREACHABLE'}
 return {status:'PRESENT',record:rec,policy,mode};
}
export async function refreshDisposableList(){
 try{
  const r=await fetch(DISPOSABLE_URL,{signal:AbortSignal.timeout(10000),headers:{'user-agent':'MAILTYPE/1.0'}});
  if(!r.ok)throw new Error(`dataset_http_${r.status}`);
  const text=await r.text();
  const next=new Set(text.split(/\r?\n/).map(x=>x.trim().toLowerCase()).filter(x=>x&&!x.startsWith('#')));
  if(next.size<1000)throw new Error('dataset_too_small');
  disposableSet=next; disposableUpdatedAt=new Date().toISOString(); disposableError=null;
  return next.size;
 }catch(e){disposableError=e.message;throw e}
}
export function getDisposableStatus(){return {loaded:!!disposableSet,count:disposableSet?.size||0,updated_at:disposableUpdatedAt,error:disposableError}}
function disposable(domain){
 if(!disposableSet)return {status:'UNKNOWN',source:'dataset_unavailable'};
 const parts=domain.split('.');
 for(let i=0;i<parts.length-1;i++){if(disposableSet.has(parts.slice(i).join('.')))return {status:'YES',source:'disposable-email-domains'}}
 return {status:'NO',source:'disposable-email-domains'};
}
export async function inspectInput(input){
 const domain=normalizeDomain(input), checked_at=new Date().toISOString(), evidence=[];
 let mx=[], domainExists='UNKNOWN', canReceive='UNKNOWN', confidence='MEDIUM';
 try{
  mx=await resolveMx(domain);
  domainExists='YES';
 }catch(e){if(e.code==='ENOTFOUND'){domainExists='NO';canReceive='NO';confidence='HIGH';evidence.push('DNS resolver returned NXDOMAIN/ENOTFOUND')}}
 if(domainExists!=='NO'){
  if(mx.length){
   domainExists='YES';
   const nullMx=mx.length===1 && (mx[0].exchange===''||mx[0].exchange==='.');
   if(nullMx){canReceive='NO';confidence='HIGH';evidence.push('Null MX explicitly indicates domain does not accept email')}
   else {canReceive='YES';confidence='HIGH';evidence.push(`${mx.length} MX record(s) detected`)}
  }else{
   const ex=await existsAny(domain);
   if(ex===false){domainExists='NO';canReceive='NO';confidence='HIGH';evidence.push('No DNS domain found')}
   else if(ex===true){domainExists='YES';canReceive='UNKNOWN';confidence='MEDIUM';evidence.push('Domain exists but no explicit MX was detected; MAILTYPE does not assume mailbox acceptance')}
   else evidence.push('DNS evidence was inconclusive');
  }
 }
 let rootTxt=[],dmarcTxt=[];
 if(domainExists==='YES'){
  try{rootTxt=await resolveTxt(domain)}catch{}
  try{dmarcTxt=await resolveTxt(`_dmarc.${domain}`)}catch{}
 }
 const spf=txtFinding(rootTxt,'v=spf1');
 const dmarc=txtFinding(dmarcTxt,'v=DMARC1');
 const sts=domainExists==='YES'?await mtaSts(domain):{status:'UNKNOWN',record:null,policy:'UNKNOWN'};
 const disp=disposable(domain);
 evidence.push(`SPF: ${spf.status}`,`DMARC: ${dmarc.status}`,`MTA-STS: ${sts.status}`,`Disposable dataset: ${disp.status}`);
 return {
  input:String(input),domain,
  domain_exists:domainExists,
  can_receive_mail:canReceive,
  mx,
  mx_provider:provider(mx),
  disposable:disp.status,
  disposable_source:disp.source,
  spf,
  dmarc,
  mta_sts:sts,
  confidence,
  evidence,
  checked_at
 };
}
export const _test={normalizeDomain,provider,txtFinding};
