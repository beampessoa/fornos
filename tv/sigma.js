/* ==========================================================================
   SIGMA PLANEJAMENTO — motor compartilhado (config + Supabase + render)
   Configure UMA vez abaixo. Sem anon key => modo demonstração.
   ========================================================================== */
const CONFIG = {
  SUPABASE_URL:      (typeof window!=="undefined" && window.SUPA_URL) || "https://kiwiykgzogcxiseynzyy.supabase.co",
  SUPABASE_ANON_KEY: (typeof window!=="undefined" && window.SUPA_KEY) || "COLE_SUA_ANON_KEY_AQUI",  // vem do supabase-config.js
  UNIDADE:"U-4241 · U-4283", REFINARIA:"REFINARIA DE PAULÍNIA · FORNOS",
  LOGO_GCB_URL:"", FOTO_URL:"", REFINARIA_LOGO_URL:"", QR_URL:"https://fornos.sigmacode.com.br",
  DIA_INICIO:4, DIA_FIM:25,      // faixa de dias da matriz/curva (dia do mês)
  STALE_HORAS:3,                 // sem atualização há + de X h => avisa "dado desatualizado"
  ROTATE_SECONDS:20,             // tempo em cada página no modo TV (?tv=1)
  TEMA:"claro",
};
let DEMO = true;   /* fornos: protótipo lê os dados de tv-dados.js */
const sb = null;

/* ---------- painel por unidade (29/09/2026) ----------
   As doze tabelas do painel tem a coluna un. O link diz quais unidades a tela
   mostra: ?un=2700, ou ?un=3400,3500,3400/3500 para o conjunto. Sem un no
   link, vale o primeiro botao de vw_painel_ativos (conjunto em parada antes,
   depois unidade em parada, depois unidade fechando).
   Conjunto nao e calculado no banco: cada unidade e calculada uma vez e aqui
   a tela soma. Percentual e sempre numerador somado sobre denominador somado,
   nunca media de percentuais. */
const PAINEL_TAB=new Set(["painel_config","planejamento_itens","curva_s","curva_resumo","psv","punch_list",
  "lista_operacional","medidas_zr","caminho_critico","gm_servicos","gantt_tarefas","stand_by"]);
let UNS=null;
function unsDaUrl(){ const v=new URLSearchParams(location.search).get("un");
  return v ? v.split(",").map(x=>x.trim()).filter(Boolean) : null; }
async function resolveUns(){
  UNS=unsDaUrl(); if(UNS||DEMO) return;
  try{
    const {data,error}=await sb.from("vw_painel_ativos").select("*"); if(error) throw error;
    const ord=b=>(b.fase==="parada"?0:10)+(b.ordem||2);
    const b=(data||[]).slice().sort((x,y)=>ord(x)-ord(y))[0];
    UNS=b&&b.unidades&&b.unidades.length ? b.unidades : ["2700"];
  }catch(e){ console.warn("vw_painel_ativos",e.message||e); UNS=["2700"]; }
}
const unsQs=()=> UNS&&UNS.length ? "un="+UNS.map(encodeURIComponent).join(",") : "";
const temFlare=()=> !UNS || UNS.includes("2700");
const nnum=v=> v==null||v==="" ? null : Number(v);
function somaCampo(rows,k){ const v=rows.map(r=>nnum(r[k])).filter(x=>x!=null&&!isNaN(x)); return v.length? v.reduce((a,b)=>a+b,0) : null; }
function agrupa(rows,chave,campos){ const g={}, ordem=[];
  rows.forEach(r=>{ const k=r[chave]; if(!g[k]){ g[k]=[]; ordem.push(k); } g[k].push(r); });
  return ordem.map(k=>{ const o=Object.assign({},g[k][0]); campos.forEach(c=>o[c]=somaCampo(g[k],c)); return o; }); }
function mergePainel(table,rows){
  if(!UNS||UNS.length<2||!rows.length) return rows;
  const pos=u=>{ const i=UNS.indexOf(u); return i<0?99:i; };
  rows=rows.slice().sort((a,b)=>pos(a.un)-pos(b.un));
  if(table==="painel_config"){
    const b=Object.assign({},rows[0]);
    const simples=rows.filter(r=>!String(r.un||"").includes("/"));
    b.unidade=(simples.length?simples:rows).map(r=>r.unidade||("U-"+r.un)).join(" · ");
    const ini=rows.map(r=>r.parada_inicio).filter(Boolean).sort(), fim=rows.map(r=>r.parada_fim).filter(Boolean).sort();
    if(ini.length) b.parada_inicio=ini[0]; if(fim.length) b.parada_fim=fim[fim.length-1];
    const an=rows.map(r=>r.analise&&((r.unidade||r.un)+": "+r.analise)).filter(Boolean);
    b.analise=an.join("  ·  ");
    return [b];
  }
  if(table==="psv"){
    const b=Object.assign({},rows[0]); ["total","removido","manutencao","instalado"].forEach(c=>b[c]=somaCampo(rows,c)||0);
    const pesos=rows.filter(r=>nnum(r.pct_real)!=null&&Number(r.total)>0);
    const pt=pesos.reduce((a,r)=>a+Number(r.total),0);
    b.pct_real= pt? pesos.reduce((a,r)=>a+Number(r.pct_real)*Number(r.total),0)/pt : null;
    return [b];
  }
  if(table==="curva_resumo"){
    const et=rows.filter(r=>String(r.tipo).toUpperCase()==="ETAPAS");
    const out=agrupa(rows,"tipo",["previsto","realizado","restante"]);
    const e=out.find(r=>String(r.tipo).toUpperCase()==="ETAPAS"), p=out.find(r=>String(r.tipo).toUpperCase()==="PERCENTUAL");
    if(p){
      if(e&&Number(e.previsto)>0){ p.realizado=Math.round(Number(e.realizado)/Number(e.previsto)*10000)/100; p.restante=Math.round((100-p.realizado)*100)/100; }
      // previsto do conjunto: media pesada pelas etapas de cada unidade, so
      // entre as unidades que tem previsto publicado
      const pp=rows.filter(r=>String(r.tipo).toUpperCase()==="PERCENTUAL"&&nnum(r.previsto)!=null).map(r=>{
        const eu=et.find(x=>x.un===r.un); return {v:Number(r.previsto), w:eu?Number(eu.previsto)||0:0}; });
      const w=pp.reduce((a,x)=>a+x.w,0);
      p.previsto= pp.length ? (w? pp.reduce((a,x)=>a+x.v*x.w,0)/w : pp[0].v) : null;
    }
    return out;
  }
  if(table==="curva_s") return agrupa(rows,"dia",["previsto_dia","real_dia","previsto_acum","real_acum"]);
  if(table==="medidas_zr") return agrupa(rows,"item",["total","pendente","iniciado","concluido"]);
  if(table==="gm_servicos") return agrupa(rows,"categoria",["total","pendente","iniciado","concluido"]);
  if(table==="punch_list") return rows.map((r,i)=>Object.assign({},r,{item:String(i+1)}));
  if(table==="lista_operacional") return rows.map((r,i)=>Object.assign({},r,{item_geral:String(i+1)}));
  return rows;
}

/* ---------- dados de demonstração (só quando não há anon key) ---------- */
let DEMO_DATA = {
  config:{ unidade:"U-2700 · U-3500 · U-3400", refinaria:"REFINARIA DUQUE DE CAXIAS", ultima_atualizacao:"01/06/2024 16:16:55",
    parada_inicio:"2024-05-06", parada_fim:"2024-05-29", termino_planejado:"29/05/24 14:30", termino_real:"29/05/24 14:30",
    clima_temp:"27°C", clima_chuva:"2%", clima_umidade:"68%", clima_vento:"8 km/h", paralizacoes:"", analise:"",
    foto_url:"https://kiwiykgzogcxiseynzyy.supabase.co/storage/v1/object/public/LOGO-Empresas/Reduc%20Drone.jpeg",
    logo_gcb_url:"https://kiwiykgzogcxiseynzyy.supabase.co/storage/v1/object/public/LOGO-Empresas/gcb.png",
    refinaria_logo_url:"https://kiwiykgzogcxiseynzyy.supabase.co/storage/v1/object/public/LOGO-Empresas/Reduc.png" },
  escopo:[["EJETORES",7,7],["FILTRO",53,53],["GM'S",6,6],["HIDROJATO",16,16],["PSV'S",80,80],["REENGAXETAMENTO",92,92],["SERV. ESP.",21,21],["VÁLV. FLANGEADA",284,284],["VÁLV. RETENÇÃO",198,198],["VÁLV. ROSCADA",5,5],["VÁLV. SOLDADA",168,168],["VAZAMENTOS",8,8],["ZR'S",75,75]],
  extra:[["VAZAMENTOS",65,65],["ZR'S",113,113]],
  acumDia:[41,95,146,222,296,355,359,420,493,541,579,622,702,702,772,834,867,928,1002,1069,1108,1149,1167,1191],
  crit:[{segmento:"ÁGUA DE MÁQUINAS",status:"EM ANDAMENTO",pct_planejado:100,pct_realizado:100,pct_desvio:0}],
  psv:{total:80,removido:80,manutencao:80,instalado:80,pct_real:100},
  gm:[{categoria:"GM'S",total:6,pendente:0,iniciado:0,concluido:6},{categoria:"SERV. ESP.",total:21,pendente:0,iniciado:0,concluido:21},{categoria:"VAZAMENTOS",total:73,pendente:0,iniciado:0,concluido:73}],
  zr:[{item:"ESCOPO",total:75,pendente:0,iniciado:0,concluido:75},{item:"EXTRA",total:113,pendente:0,iniciado:0,concluido:113}],
  gantt:[{grupo:'24"',tarefa:"JUNTA 1",data_inicio:"2024-05-13",data_fim:"2024-05-14",status:"CONCLUIDO"},{grupo:'24"',tarefa:"JUNTA 2",data_inicio:"2024-05-14",data_fim:"2024-05-15",status:"CONCLUIDO"},{grupo:'24"',tarefa:"JUNTA 3",data_inicio:"2024-05-15",data_fim:"2024-05-16",status:"CONCLUIDO"},{grupo:'24"',tarefa:"JUNTA 4",data_inicio:"2024-05-16",data_fim:"2024-05-17",status:"CONCLUIDO"},{grupo:'8"',tarefa:"JUNTA 1",data_inicio:"2024-05-20",data_fim:"2024-05-21",status:"INICIADO"},{grupo:'8"',tarefa:"JUNTA 2",data_inicio:"2024-05-21",data_fim:"2024-05-22",status:"NAO_INICIADO"},{grupo:'4"',tarefa:"JUNTA 1",data_inicio:"2024-05-23",data_fim:"2024-05-24",status:"NAO_INICIADO"}],
  curva:(()=>{const a=[41,95,146,222,296,355,359,420,493,541,579,622,702,702,772,834,867,928,1002,1069,1108,1149,1167,1191];return a.map((v,i)=>({dia:`2024-05-${String(6+i).padStart(2,"0")}`,real_dia:i?v-a[i-1]:v,previsto_dia:i?v-a[i-1]:v,real_acum:v*0.98,previsto_acum:v}));})(),
  curvaResumo:[{tipo:"PERCENTUAL",previsto:100,realizado:100,restante:0},{tipo:"ATIVIDADES",previsto:4744,realizado:4744,restante:0},{tipo:"HH",previsto:16879,realizado:16879,restante:0}],
  listaOp:[[38,"D-5106","AMOSTRADOR ÁGUA DA DESSALGADORA DO D-51006 DESCONECTADO",100,"",false],[55,"D-5104","PSV-007 NÃO FORAM TORQUEADA",100,"Segunda Lista recebida 31/05",true],[56,"","PSV-015 NÃO FORAM TORQUEADA",100,"Segunda Lista recebida 31/05",true],[59,"H-5103","FV-053 FALTA REINSTALAR BLOQUEIO DO BY-PASS DA VÁLVULA",100,"",true],[62,"FV-56","FALTANDO FLANGE DO BLOQUEIO DE BY PASS",100,"",false],[69,"P-5123B","REMOVIDOS OS SPOOL DE DESCARGA — NÃO RETORNARAM",100,"",true],[81,"FV-5177","BY-PASS INSTALADA COM SENTIDO INVERTIDO",100,"",true],[119,"ACESSO T-5104","SEM CORRENTE DE PROTEÇÃO NO ACESSO",100,"",false],[136,"P-5146","INSTALAÇÃO DE VENTURE NA DESCARGA DA P-5146",100,"Segunda Lista recebida 31/05",true],[171,"T-5103","TUBULAÇÃO DESMONTADA E DESCONECTADA DO E-5116",100,"Segunda Lista recebida 31/05",true]],
  punch:[[62,"FV-56","FALTANDO FLANGE DO BLOQUEIO DE BY PASS",100],[59,"H-5103","FV-053 FALTA REINSTALAR BLOQUEIO",100]],
  standby:{DIA:{sup:"Carlinhos",f:[["CALDEIREIRO",24],["AJUDANTE",10],["MONTADOR DE ANDAIME",10],["SOLDADOR",6],["ALPINISTA",2],["INSPETOR",2],["MECÂNICO DE VÁLVULAS",2],["ELETRICISTA",1]]},
            NOITE:{sup:"Cícero",f:[["CALDEIREIRO",24],["AJUDANTE",10],["MONTADOR DE ANDAIME",10],["SOLDADOR",6],["ALPINISTA",2],["INSPETOR",2],["MECÂNICO DE VÁLVULAS",2],["ELETRICISTA",1]]}},
};

/* ============ CENÁRIOS FICTÍCIOS (apresentação) — ativa com ?demo=cenario1|2|3 ============ */
const SIGMA_LOGO_DEMO="https://kiwiykgzogcxiseynzyy.supabase.co/storage/v1/object/public/LOGO-Empresas/sigmacode.png";
function _curvaDemo(prevTotal,pctDone,dias){
  const arr=[]; let pA=0,rA=0; const today=Math.round(dias*pctDone);
  const S=t=>Math.round(prevTotal*(1/(1+Math.exp(-9*(t-0.5)))));
  for(let i=0;i<dias;i++){ const p=S((i+1)/dias); const pDia=p-pA; pA=p;
    let r=rA; if(i<=today) r=Math.round(S((i+1)/dias)*0.95); const rDia=Math.max(0,r-rA); rA=r;
    arr.push({dia:`2025-09-${String(1+i).padStart(2,"0")}`,previsto_dia:pDia,real_dia:rDia,previsto_acum:pA,real_acum:rA}); }
  return arr;
}
function _cenario(o){
  const dias=24, curva=_curvaDemo(1200,o.pct,dias), acumDia=curva.map(p=>p.real_acum), ativ=4820, hh=17240;
  return {
    config:{ unidade:"U-4200 · U-4600 · U-5100", refinaria:"REFINARIA COSTA AZUL", ultima_atualizacao:o.upd,
      parada_inicio:"2025-09-01", parada_fim:"2025-09-26", termino_planejado:"26/09/25 18:00", termino_real:o.tr||"—",
      dias_ocorridos:o.dias_oco,
      clima_temp:"29°C", clima_chuva:"10%", clima_umidade:"72%", clima_vento:"12 km/h",
      paralizacoes:"", analise:"", foto_url:"", refinaria_logo_url:"", logo_gcb_url:"" },
    escopo:o.escopo, extra:o.extra||[], acumDia, curva,
    curvaResumo:[{tipo:"PERCENTUAL",previsto:100,realizado:Math.round(o.pct*100),restante:100-Math.round(o.pct*100)},
      {tipo:"ATIVIDADES",previsto:ativ,realizado:Math.round(ativ*o.pct),restante:ativ-Math.round(ativ*o.pct)},
      {tipo:"HH",previsto:hh,realizado:Math.round(hh*o.pct),restante:hh-Math.round(hh*o.pct)}],
    crit:o.crit, psv:o.psv, gm:o.gm, zr:o.zr, gantt:o.gantt,
    listaOp:o.listaOp, punch:o.punch||[], standby:o.standby, atrasados:o.atrasados||0
  };
}
const _crew=m=>({DIA:{sup:"R. Andrade",f:[["CALDEIREIRO",Math.round(26*m)],["AJUDANTE",Math.round(12*m)],["MONTADOR DE ANDAIME",Math.round(11*m)],["SOLDADOR",Math.round(7*m)],["ALPINISTA",Math.round(3*m)],["INSPETOR",2],["MECÂNICO DE VÁLVULAS",Math.round(3*m)],["ELETRICISTA",Math.round(2*m)]]},
  NOITE:{sup:"M. Teixeira",f:[["CALDEIREIRO",Math.round(22*m)],["AJUDANTE",Math.round(10*m)],["MONTADOR DE ANDAIME",Math.round(9*m)],["SOLDADOR",Math.round(6*m)],["ALPINISTA",2],["INSPETOR",2],["MECÂNICO DE VÁLVULAS",2],["ELETRICISTA",1]]}});
const CENARIOS={
  cenario1:_cenario({ pct:0.16, upd:"05/09/2025 08:15", atrasados:3, dias_oco:4,
    escopo:[["EJETORES",12,2,3,0],["FILTROS",60,10,12,0],["GM'S",8,1,2,0],["HIDROJATO",20,3,4,0],["PSV'S",96,14,20,0],["REENGAXETAMENTO",88,12,18,0],["SERV. ESP.",24,3,5,0],["VÁLV. FLANGEADA",310,60,70,0],["VÁLV. RETENÇÃO",210,40,45,0],["VÁLV. ROSCADA",6,1,1,0],["VÁLV. SOLDADA",180,20,30,3],["VAZAMENTOS",40,5,6,0],["ZR'S",90,12,15,0]],
    extra:[["VAZAMENTOS",22,4],["ZR'S",30,6]],
    crit:[{segmento:'LINHA 30" — SOLDAGEM',status:"EM ANDAMENTO",pct_planejado:30,pct_realizado:18,pct_desvio:12}],
    psv:{total:96,removido:60,manutencao:40,instalado:12,pct_real:12},
    gm:[{categoria:"GM'S",total:8,pendente:5,iniciado:2,concluido:1},{categoria:"SERV. ESP.",total:24,pendente:16,iniciado:5,concluido:3},{categoria:"VAZAMENTOS",total:40,pendente:29,iniciado:6,concluido:5}],
    zr:[{item:"ESCOPO",total:90,pendente:63,iniciado:15,concluido:12},{item:"EXTRA",total:30,pendente:20,iniciado:4,concluido:6}],
    gantt:[{grupo:'LINHA 30"',tarefa:"JUNTA 1",data_inicio:"2025-09-03",data_fim:"2025-09-04",status:"INICIADO"},{grupo:'LINHA 30"',tarefa:"JUNTA 2",data_inicio:"2025-09-04",data_fim:"2025-09-05",status:"NAO_INICIADO"},{grupo:'LINHA 16"',tarefa:"JUNTA 1",data_inicio:"2025-09-06",data_fim:"2025-09-07",status:"NAO_INICIADO"},{grupo:'LINHA 8"',tarefa:"JUNTA 1",data_inicio:"2025-09-08",data_fim:"2025-09-09",status:"NAO_INICIADO"}],
    listaOp:[[12,"P-4201A","BOMBA DE CARGA — AGUARDANDO LIBERAÇÃO DE ÁREA",20,"",true],[34,"V-4610","VASO SEPARADOR — ISOLAMENTO EM MONTAGEM",35,"",false],[47,"PSV-088","VÁLVULA DE SEGURANÇA REMOVIDA P/ BANCADA",60,"",false],[58,"FV-112","BY-PASS AGUARDANDO FLANGE",10,"Falta material",true]],
    standby:_crew(1.15) }),
  cenario2:_cenario({ pct:0.56, upd:"14/09/2025 16:40", atrasados:25, dias_oco:14,
    escopo:[["EJETORES",12,7,3,2],["FILTROS",60,34,15,0],["GM'S",8,5,2,0],["HIDROJATO",20,11,5,3],["PSV'S",96,54,20,0],["REENGAXETAMENTO",88,50,20,0],["SERV. ESP.",24,13,6,0],["VÁLV. FLANGEADA",310,175,60,12],["VÁLV. RETENÇÃO",210,120,40,0],["VÁLV. ROSCADA",6,3,2,0],["VÁLV. SOLDADA",180,95,40,8],["VAZAMENTOS",40,22,10,0],["ZR'S",90,50,20,0]],
    extra:[["VAZAMENTOS",22,12],["ZR'S",30,17]],
    crit:[{segmento:'LINHA 30" — SOLDAGEM',status:"ATRASADO",pct_planejado:65,pct_realizado:48,pct_desvio:17},{segmento:"VÁLV. FLANGEADA",status:"EM ANDAMENTO",pct_planejado:60,pct_realizado:56,pct_desvio:4}],
    psv:{total:96,removido:96,manutencao:70,instalado:52,pct_real:54},
    gm:[{categoria:"GM'S",total:8,pendente:1,iniciado:2,concluido:5},{categoria:"SERV. ESP.",total:24,pendente:5,iniciado:6,concluido:13},{categoria:"VAZAMENTOS",total:40,pendente:8,iniciado:10,concluido:22}],
    zr:[{item:"ESCOPO",total:90,pendente:20,iniciado:20,concluido:50},{item:"EXTRA",total:30,pendente:6,iniciado:7,concluido:17}],
    gantt:[{grupo:'LINHA 30"',tarefa:"JUNTA 1",data_inicio:"2025-09-03",data_fim:"2025-09-04",status:"CONCLUIDO"},{grupo:'LINHA 30"',tarefa:"JUNTA 2",data_inicio:"2025-09-04",data_fim:"2025-09-05",status:"CONCLUIDO"},{grupo:'LINHA 30"',tarefa:"JUNTA 3",data_inicio:"2025-09-06",data_fim:"2025-09-08",status:"INICIADO"},{grupo:'LINHA 16"',tarefa:"JUNTA 1",data_inicio:"2025-09-09",data_fim:"2025-09-10",status:"INICIADO"},{grupo:'LINHA 16"',tarefa:"JUNTA 2",data_inicio:"2025-09-11",data_fim:"2025-09-12",status:"NAO_INICIADO"},{grupo:'LINHA 8"',tarefa:"JUNTA 1",data_inicio:"2025-09-13",data_fim:"2025-09-14",status:"NAO_INICIADO"}],
    listaOp:[[12,"P-4201A","SPOOL DE DESCARGA REMOVIDO — NÃO RETORNOU",70,"Aguardando caldeiraria",true],[23,"T-4605","PSV-045 NÃO TORQUEADA",80,"2ª lista 12/09",true],[31,"H-5102","FV-053 FALTA REINSTALAR BLOQUEIO DO BY-PASS",60,"",true],[44,"D-4108","AMOSTRADOR DESCONECTADO",90,"",false],[59,"FV-5177","BY-PASS INSTALADA EM SENTIDO INVERTIDO",50,"Corrigir",true],[76,"E-4620","FEIXE REMOVIDO — INSPEÇÃO PENDENTE",40,"",true],[88,"V-5101","VÁLVULA DE SEGURANÇA — TESTE REPROVADO",30,"Reteste",true]],
    standby:_crew(1.0) }),
  cenario3:_cenario({ pct:0.94, upd:"24/09/2025 19:05", atrasados:2, dias_oco:23,
    escopo:[["EJETORES",12,12,0,0],["FILTROS",60,58,2,0],["GM'S",8,8,0,0],["HIDROJATO",20,19,1,0],["PSV'S",96,92,4,0],["REENGAXETAMENTO",88,86,2,0],["SERV. ESP.",24,23,1,0],["VÁLV. FLANGEADA",310,296,10,2],["VÁLV. RETENÇÃO",210,203,7,0],["VÁLV. ROSCADA",6,6,0,0],["VÁLV. SOLDADA",180,173,7,0],["VAZAMENTOS",40,39,1,0],["ZR'S",90,88,2,0]],
    extra:[["VAZAMENTOS",22,22],["ZR'S",30,29]],
    crit:[{segmento:'LINHA 30" — SOLDAGEM',status:"EM ANDAMENTO",pct_planejado:98,pct_realizado:96,pct_desvio:2}],
    psv:{total:96,removido:96,manutencao:96,instalado:90,pct_real:94},
    gm:[{categoria:"GM'S",total:8,pendente:0,iniciado:0,concluido:8},{categoria:"SERV. ESP.",total:24,pendente:0,iniciado:1,concluido:23},{categoria:"VAZAMENTOS",total:40,pendente:0,iniciado:1,concluido:39}],
    zr:[{item:"ESCOPO",total:90,pendente:0,iniciado:2,concluido:88},{item:"EXTRA",total:30,pendente:0,iniciado:1,concluido:29}],
    gantt:[{grupo:'LINHA 30"',tarefa:"JUNTA 1",data_inicio:"2025-09-03",data_fim:"2025-09-04",status:"CONCLUIDO"},{grupo:'LINHA 30"',tarefa:"JUNTA 2",data_inicio:"2025-09-04",data_fim:"2025-09-05",status:"CONCLUIDO"},{grupo:'LINHA 16"',tarefa:"JUNTA 1",data_inicio:"2025-09-09",data_fim:"2025-09-10",status:"CONCLUIDO"},{grupo:'LINHA 16"',tarefa:"JUNTA 2",data_inicio:"2025-09-11",data_fim:"2025-09-12",status:"CONCLUIDO"},{grupo:'LINHA 8"',tarefa:"JUNTA 1",data_inicio:"2025-09-20",data_fim:"2025-09-22",status:"INICIADO"}],
    listaOp:[[95,"P-4201A","ALINHAMENTO FINAL DA BOMBA",95,"",false],[112,"T-4605","TORQUE FINAL PSV-045",90,"",true],[130,"FV-112","REINSTALAÇÃO DE BLOQUEIO",85,"",false]],
    standby:_crew(0.6) })
};
if(window.TV_FORNOS){ DEMO_DATA=window.TV_FORNOS; CONFIG.LOGO_GCB_URL=window.LOGO_GCB||""; }

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const pct=(r,p)=> p? Math.min(100,(r/p)*100):0;
const pf=n=>(Number(n)||0).toFixed(2).replace(".",",")+"%";          // 87.3 -> "87,30%"
const brandCol=v=>{ try{ return getComputedStyle(document.body).getPropertyValue(v).trim()||"#16A34A"; }catch(e){ return "#16A34A"; } };
const pc=(r,p)=>pf(pct(r,p));                                        // razão -> "%"
const br=n=>(Number(n)||0).toLocaleString("pt-BR");
const dom=d=> d? new Date(d).getUTCDate():null;                    // dia do mês
const daysBetween=(a,b)=> Math.round((new Date(b)-new Date(a))/864e5);
const today0=()=>{ const d=new Date(); d.setHours(0,0,0,0); return d; };
function isDone(it){ return String(it.status||"").toUpperCase()==="CONCLUIDO" || Number(it.percentual_avanco)>=100; }
/* Realizado do painel = LS que andou DENTRO da parada. O status EXECUCAO marca
   isso na carga. Nao serve olhar so "tem etapa lancada": quase toda LS tem a
   etapa 1 de emplaquetamento lancada antes da parada, e ai tudo contaria como
   realizado. Item concluido tambem conta como realizado, obviamente. */
function isRunning(it){ const s=String(it.status||"").toUpperCase();
  return s==="EXECUCAO" || s==="CONCLUIDO" || Number(it.percentual_avanco)>=100; }
function isStarted(it){ const p=Number(it.percentual_avanco)||0; return !isDone(it) && p>0; }
function isOverdue(it){ return !isDone(it) && it.data_planejada && new Date(it.data_planejada) < today0(); }
// "Concluído" no selo de status olha a conclusao de verdade (torque com foto),
// nunca o realizado: senao um segmento todo em execucao apareceria concluido.
function segStatus(r){ if(r.prev>0 && (r.concl||0)>=r.prev) return {c:"done",t:"Concluído"};
  if(r.overdue>0) return {c:"bad",t:"Atrasado"}; if((r.real||0)>0 || (r.started||0)>0) return {c:"run",t:"Em andamento"}; return {c:"wait",t:"Pendente"}; }
function parseUpd(s){ if(!s) return null; const [dmy,hms]=String(s).trim().split(" "); const [d,m,y]=(dmy||"").split("/"); if(!y) return null;
  const t=new Date(`${y}-${m}-${d}T${hms||"00:00:00"}`); return isNaN(t)?null:t.getTime(); }

const STATE={ connected:!DEMO, lastUpd:null };
/* Leitura paginada: o PostgREST corta em 1.000 linhas em silencio.
   Sem o range abaixo, uma tabela grande volta truncada sem erro nenhum,
   e o denominador do percentual some junto com as linhas cortadas. */
async function q(table){ if(DEMO) return ((window.TV_Q||{})[table]||[]).slice();
  const PAG=1000, TETO=50000; let saida=[], de=0;
  try{
    for(;;){
      let qq=sb.from(table).select("*");
      if(PAINEL_TAB.has(table)&&UNS&&UNS.length) qq=qq.in("un",UNS);
      const {data,error}=await qq.range(de,de+PAG-1);
      if(error) throw error;
      const lote=data||[]; saida=saida.concat(lote);
      if(lote.length<PAG) break;                       // ultima pagina
      de+=PAG;
      if(de>=TETO){ console.warn("Supabase",table,"passou de",TETO,"linhas, leitura interrompida"); break; }
    }
    setConn(true); return mergePainel(table,saida);
  }catch(e){ console.warn("Supabase",table,e.message||e); setConn(false); return []; }
}
function setConn(ok){ STATE.connected=ok; liveState(); }
function liveState(){ const e=$("#live"); if(!e) return; const t=$("#liveTxt");
  if(DEMO){ e.className="live on"; if(t)t.textContent="demonstração"; return; }
  if(!STATE.connected){ e.className="live off"; if(t)t.textContent="reconectando"; return; }
  if(STATE.lastUpd && (Date.now()-STATE.lastUpd)/3600000 > CONFIG.STALE_HORAS){ e.className="live off"; if(t)t.textContent="dado desatualizado"; return; }
  e.className="live on"; if(t)t.textContent="ao vivo"; }

/* ---------- velocímetro (gauge) SVG igual ao BI ---------- */
function setGauge(el,val,opts){ if(!el) return; opts=opts||{};
  const min=opts.min||"0%", max=opts.max||"100%", label=(opts.label!=null?opts.label:Math.round(val)+"%");
  const needleAt=(opts.needle!=null?opts.needle:val), f=Math.max(0,Math.min(100,val))/100;
  const cx=100,cy=100,r=80,sw=24,L=66, th=Math.PI*(1-Math.max(0,Math.min(100,needleAt))/100);
  const nx=(cx+L*Math.cos(th)).toFixed(1), ny=(cy-L*Math.sin(th)).toFixed(1), path=`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`;
  el.innerHTML=`<svg viewBox="0 0 200 126"><path class="gg-track" d="${path}" stroke-width="${sw}" pathLength="100"/>
    <path class="gg-fill" d="${path}" stroke-width="${sw}" pathLength="100" stroke-dasharray="${(f*100).toFixed(2)} 100"/>
    <line class="gg-needle" x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}"/><circle class="gg-pivot" cx="${cx}" cy="${cy}" r="4.5"/>
    <text class="gg-val" x="${cx}" y="${cy-4}" text-anchor="middle" font-size="30">${label}</text>
    <text class="gg-mm" x="${cx-r}" y="${cy+20}" text-anchor="middle" font-size="12">${min}</text>
    <text class="gg-mm" x="${cx+r}" y="${cy+20}" text-anchor="middle" font-size="12">${max}</text></svg>`;
}

/* ---------- shell (cabeçalho + rodapé/nav) ---------- */
const PAGES=[["01-menu.html","MENU"],["02-escopo.html","ESCOPO"],["03-resumo.html","RESUMO"],["04-lin24.html","JUNTAS"],["05-punch.html","PENDÊNCIAS"],["06-curva-s.html","CURVA S"],["07-list-op.html","ZR EXTRA"],["08-standby.html","STAND BY"]];
function paginas(){ return PAGES.filter(p=>p[0]!=="04-lin24.html"||temFlare()); }
function buildShell(page,title){
  const cur=(location.pathname.split("/").pop())||page;
  const cq=new URLSearchParams(location.search);
  // O que segue de uma tela para a outra pelo rodape. O tv saiu daqui porque
  // o giro nao depende mais de parametro na URL: clicar num nome de tela
  // troca de tela e o painel continua girando.
  const base=[]; if(cq.get("theme")) base.push("theme="+cq.get("theme")); if(cq.get("demo")) base.push("demo="+cq.get("demo")); if(cq.get("t")) base.push("t="+cq.get("t"));
  if(unsQs()) base.push(unsQs());
  const qs=base.length?"?"+base.join("&"):"";
  // Botao de pausa: aparece sempre e nao navega, so liga e desliga o giro na
  // hora. Na TV, recarregar a pagina para pausar era lento e fazia a tela
  // piscar. O mesmo efeito vem de um clique em qualquer area vazia.
  const ctrl = `<button class="btn tvctrl" id="sgTvBtn" type="button">⏸ Pausar</button>`;
  const nav=`<a href="../index.html" title="Voltar ao início">INÍCIO</a>`+paginas().map(([h,l])=>`<a href="${h}${qs}" class="${h===cur?'on':''}">${l}</a>`).join("");
  const isMenu=page==="menu";
  const sc=document.querySelector(".screen");
  if(sc && !$("#alertbar")) sc.insertAdjacentHTML("afterbegin",`<div class="alertbar" id="alertbar"></div>`);
  if(!isMenu){
    $("#hdr").outerHTML=`<header class="hdr" id="hdr">
      <div class="brand"><div class="logo" id="logo"><span>SUA EMPRESA</span></div><div><b style="font-size:1.1em">SIGMA</b><small>PLANEJAMENTO</small></div></div>
      <div class="htitle"><h1 id="hTitle">${title||""}</h1><div class="unit" id="hUnit">${CONFIG.UNIDADE}</div></div>
      <div class="counters"><div class="c"><b class="num" id="cMan">—</b><span>Manutenção</span></div>
        <div class="c"><b class="num" id="cOco">—</b><span>Ocorridos</span></div>
        <div class="c"><b class="num" id="cRes">—</b><span>Restantes</span></div></div>
      <div class="upd"><span class="lbl">Última atualização:</span><b id="upd">—</b>
        <div class="live off" id="live"><span class="dot"></span><span id="liveTxt">conectando</span></div></div></header>`;
    if(sc) sc.style.gridTemplateRows="auto auto 1fr auto";   // alerta, cabeçalho, conteúdo, rodapé
  } else {
    const h=$("#hdr"); if(h) h.remove();
    const fixMenu=()=>{ if(!sc) return;
      if(window.innerWidth>820){ sc.style.gridTemplateRows="auto 1fr auto"; sc.style.minHeight="100vh"; }
      else { sc.style.gridTemplateRows="auto auto auto"; sc.style.minHeight="auto"; } };
    fixMenu(); window.addEventListener("resize",fixMenu);
  }
  $("#ftr").outerHTML=`<footer class="ftr" id="ftr"><button class="btn" id="themeBtn" title="Claro/Escuro (T)">🌙</button>
    <nav class="nav">${nav}</nav><div class="spacer"></div>
    <button class="sg-tvbtn" id="sgZoomMenos" type="button" title="Diminuir">−</button>
    <span id="sgZoomTxt">100%</span>
    <button class="sg-tvbtn" id="sgZoomMais" type="button" title="Aumentar">+</button>
    <button class="sg-tvbtn" id="sgZoomReset" type="button" title="Voltar ao tamanho normal">100%</button>
    ${ctrl}${DEMO?'<span class="demo">Demonstração</span>':''}</footer>`;
  const logo=$("#logo"); if(logo&&CONFIG.LOGO_GCB_URL) logo.innerHTML=`<img src="${CONFIG.LOGO_GCB_URL}" alt="GCB">`;
  initTheme();
  initHints();
  initTv();
  const zm=$("#sgZoomMenos"), zp=$("#sgZoomMais"), zr=$("#sgZoomReset");
  if(zm) zm.onclick=()=>mudaZoom(-ZOOM_PASSO);
  if(zp) zp.onclick=()=>mudaZoom(+ZOOM_PASSO);
  if(zr) zr.onclick=()=>aplicaZoom(1);
  const tb=$("#sgTvBtn"); if(tb) tb.onclick=tvAlterna;
}
/* faixa de alerta: itens atrasados + impeditivos SIM */
async function renderAlerts(){
  const bar=$("#alertbar"); if(!bar) return;
  let atras=0, imped=0;
  if(DEMO){ imped=(DEMO_DATA.listaOp||[]).filter(r=>r[5]).length; atras=DEMO_DATA.atrasados||0; }
  else{ const its=await q("planejamento_itens"); atras=its.filter(isOverdue).length;
    const lo=await q("lista_operacional"); imped=lo.filter(r=>r.impeditivo).length; }
  const msgs=[];
  if(atras) msgs.push(`${atras} ${atras>1?"itens atrasados":"item atrasado"}`);
  if(imped) msgs.push(`${imped} ${imped>1?"impeditivos":"impeditivo"} (SIM)`);
  if(msgs.length){ bar.innerHTML=`<span class="ab-dot"></span> ATENÇÃO — ${msgs.join("  ·  ")}`; bar.classList.add("show"); }
  else bar.classList.remove("show");
}
/* ---------- dica em card no hover ----------
   Um card unico em position fixed, posicionado por JS. Card dentro da propria
   celula seria cortado pelo container com overflow das tabelas. O estilo entra
   por aqui de proposito, para a dica nao depender de mexer no sigma.css. */
const HINT_REALIZ="Realizado é plaqueta que andou na parada|Conta a plaqueta que tem pelo menos uma etapa registrada com PIN desde o início da parada. Concluída é outra coisa: todas as etapas do workflow fechadas, inclusive a liberação da inspeção.";
const HINT_CONCL="Concluída é a plaqueta liberada|A plaqueta só conta como concluída quando a última etapa do workflow, em geral a liberação da inspeção, está registrada com PIN. O andamento real está na coluna % Avanço.";
const HINT_AVANCO="Avanço por etapas cumpridas|Etapas registradas sobre o total de etapas do workflow de cada tipo de serviço. É a mesma medida do painel de zonas.";
const HINT_PEND="Pendente|Previsto menos realizado: plaqueta da declaração que ainda não recebeu nenhuma etapa na parada.";
function hintCss(){
  if($("#sgHintCss")) return;
  document.head.insertAdjacentHTML("beforeend",`<style id="sgHintCss">
  [data-hint]{ cursor:help; }
  /* fundo e letra em cores fixas: com background:currentColor o fundo herdaria
     o proprio color deste elemento e a letra sumiria dentro do circulo */
  /* circulo claro com letra escura: o cabecalho da tabela e verde nos dois
     temas, entao uma cor fixa evita depender de qual tema esta ligado */
  .sg-i{ display:inline-block; margin-left:5px; width:13px; height:13px; line-height:13.5px;
    border-radius:50%; font-size:10px; font-weight:800; text-align:center; vertical-align:middle;
    background:rgba(255,255,255,.62); color:#0B2A1C; font-style:normal; }
  [data-hint]:hover .sg-i{ background:#fff; }
  #sgCard{ position:fixed; z-index:99998; width:300px; padding:12px 14px; border-radius:9px;
    background:#0B1F17; color:#E6F0EA; border:1px solid rgba(255,255,255,.18);
    box-shadow:0 12px 30px rgba(0,0,0,.5); font-size:12.5px; font-weight:400; line-height:1.5;
    text-align:left; text-transform:none; letter-spacing:0; white-space:normal;
    opacity:0; visibility:hidden; transition:opacity .14s; pointer-events:none; }
  #sgCard.on{ opacity:1; visibility:visible; }
  #sgCard b{ display:block; margin-bottom:5px; font-size:13px; color:#7DD3A8; }

  /* ---- controles para TV (ponteiro do Magic Remote) ---- */
  .sg-tvbtn{ display:inline-flex; align-items:center; justify-content:center; gap:.35em;
    min-width:34px; height:28px; padding:0 9px; margin-left:5px; border:0; cursor:pointer;
    border-radius:7px; background:rgba(255,255,255,.14); color:inherit;
    font:inherit; font-size:13px; font-weight:700; line-height:1; }
  .sg-tvbtn:hover{ background:rgba(255,255,255,.28); }
  #sgZoomTxt{ font-size:12px; font-weight:700; opacity:.8; margin-left:6px; min-width:38px;
    display:inline-block; text-align:center; }
  /* Botao de foco em cada caixa. Fica sempre visivel, porque na TV nao existe
     hover confiavel: o ponteiro do controle aparece e desaparece. */
  .box{ position:relative; }
  .sg-foco-btn{ position:absolute; top:6px; right:6px; z-index:5; width:26px; height:26px;
    border:0; border-radius:6px; cursor:pointer; background:rgba(255,255,255,.13);
    color:inherit; font-size:13px; font-weight:700; line-height:26px; padding:0; }
  .sg-foco-btn:hover{ background:rgba(255,255,255,.3); }
  .sg-focado{ position:fixed !important; inset:2.5vh 2vw !important; z-index:9990 !important;
    overflow:auto !important; box-shadow:0 26px 80px rgba(0,0,0,.7) !important; }
  /* Na caixa em foco o botao cresce e vira X: com a caixa ocupando a tela, o
     fundo clicavel fica uma moldura fina, dificil de acertar com o ponteiro
     do controle a distancia. O X e o caminho de saida confiavel. */
  .sg-focado .sg-foco-btn{ width:40px; height:40px; line-height:40px; font-size:18px;
    top:10px; right:10px; background:rgba(255,255,255,.22); }
  #sgFundo{ position:fixed; inset:0; z-index:9989; background:rgba(0,0,0,.72); }
  </style>`);
}

/* ---------- zoom e foco para a TV ----------
   O Magic Remote da LG e um ponteiro, nao tem tecla de zoom, e o navegador da
   webOS nao oferece ctrl+scroll. Entao o zoom vira controle na propria tela,
   clicavel com o ponteiro, e fica salvo no localStorage para sobreviver ao
   giro das paginas do modo TV, que troca de URL a cada 20 segundos. */
const ZOOM_MIN=0.7, ZOOM_MAX=2.5, ZOOM_PASSO=0.1;
function zoomLimite(z){ return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((Number(z)||1)*100)/100)); }
function zoomAtual(){
  const p=new URLSearchParams(location.search).get("zoom");
  if(p) return zoomLimite(parseFloat(p));
  try{ const s=localStorage.getItem("sigma-zoom"); if(s) return zoomLimite(parseFloat(s)); }catch(e){}
  return 1;
}
function aplicaZoom(z){
  z=zoomLimite(z);
  const sc=document.querySelector(".screen");
  // zoom refaz o layout, ao contrario de transform:scale, que so esticaria a
  // imagem e cortaria o que passa da borda
  if(sc) sc.style.zoom=z;
  const t=$("#sgZoomTxt"); if(t) t.textContent=Math.round(z*100)+"%";
  try{ localStorage.setItem("sigma-zoom",String(z)); }catch(e){}
  return z;
}
function mudaZoom(d){ aplicaZoom(zoomAtual()+d); }

/* Foco: joga uma caixa para tela cheia. E o "zoom na parte que quero
   apresentar", sem depender de zoom do navegador. */
function rotulaFoco(){
  document.querySelectorAll(".sg-foco-btn").forEach(b=>{
    const dentro=b.closest(".box").classList.contains("sg-focado");
    b.textContent=dentro?"✕":"⤢";
    b.title=dentro?"Voltar ao painel inteiro":"Ampliar esta caixa na tela inteira";
  });
}
function foca(box){
  const jaEra=box.classList.contains("sg-focado");
  document.querySelectorAll(".sg-focado").forEach(b=>b.classList.remove("sg-focado"));
  const f=$("#sgFundo"); if(f) f.remove();
  if(!jaEra){
    document.body.insertAdjacentHTML("beforeend",'<div id="sgFundo"></div>');
    $("#sgFundo").onclick=()=>foca(box);
    box.classList.add("sg-focado");
  }
  rotulaFoco();
}
function initTv(){
  aplicaZoom(zoomAtual());
  document.querySelectorAll(".box").forEach(box=>{
    if(box.querySelector(".sg-foco-btn")) return;
    const b=document.createElement("button");
    b.className="sg-foco-btn"; b.type="button"; b.textContent="⤢";
    b.title="Ampliar esta caixa na tela inteira";
    b.onclick=e=>{ e.stopPropagation(); foca(box); };
    box.appendChild(b);
  });
}
function initHints(){
  hintCss();
  if($("#sgCard")) return;
  document.body.insertAdjacentHTML("beforeend",'<div id="sgCard"></div>');
  const card=$("#sgCard"), alvoDe=e=>(e.target&&e.target.closest)?e.target.closest("[data-hint]"):null;
  document.addEventListener("mouseover",e=>{
    const a=alvoDe(e); if(!a) return;
    const p=String(a.getAttribute("data-hint")||"").split("|");
    card.innerHTML="<b>"+esc(p[0])+"</b>"+esc(p.slice(1).join("|"));
    card.classList.add("on");
    const r=a.getBoundingClientRect(), W=300;
    let x=Math.max(8,Math.min(r.left+r.width/2-W/2, window.innerWidth-W-8));
    const h=card.offsetHeight||150;
    let y=r.bottom+9; if(y+h>window.innerHeight-8) y=Math.max(8,r.top-h-9);
    card.style.left=x+"px"; card.style.top=y+"px";
  });
  document.addEventListener("mouseout",e=>{ if(alvoDe(e)) card.classList.remove("on"); });
}
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function applyTheme(dark){ document.body.classList.toggle("dark",dark); const b=$("#themeBtn"); if(b)b.textContent=dark?"☀️":"🌙"; try{localStorage.setItem("sigma-tema",dark?"escuro":"claro");}catch(e){} }
function initTheme(){ let t=CONFIG.TEMA; try{t=localStorage.getItem("sigma-tema")||t;}catch(e){} applyTheme(t==="escuro");
  const b=$("#themeBtn"); if(b) b.onclick=()=>applyTheme(!document.body.classList.contains("dark")); }
document.addEventListener("keydown",e=>{ if(e.key==="t"||e.key==="T") applyTheme(!document.body.classList.contains("dark")); });

/* ---------- cabeçalho: config, contadores, última atualização ---------- */
async function fillHeader(){
  const cfg = DEMO ? DEMO_DATA.config : ((await q("painel_config"))[0]||{});
  if($("#hUnit")) $("#hUnit").textContent=cfg.unidade||CONFIG.UNIDADE;
  if($("#upd"))   $("#upd").textContent=cfg.ultima_atualizacao||"—";
  STATE.ini=dk(cfg.parada_inicio); STATE.fim=dk(cfg.parada_fim);
  if(cfg.parada_inicio && cfg.parada_fim && $("#cMan")){
    const tot=daysBetween(cfg.parada_inicio,cfg.parada_fim), oco=Math.max(0,Math.min(tot,daysBetween(cfg.parada_inicio,hojeBR())));
    const ocoFinal = (cfg.dias_ocorridos!=null) ? cfg.dias_ocorridos : (DEMO?tot:oco);
    $("#cMan").textContent=tot; $("#cOco").textContent=ocoFinal; $("#cRes").textContent=Math.max(0,tot-ocoFinal);
  }
  STATE.lastUpd=parseUpd(cfg.ultima_atualizacao);
  const hl=$("#logo"); if(hl && cfg.logo_gcb_url) hl.innerHTML=`<img src="${cfg.logo_gcb_url}" alt="">`;
  STATE.connected=!DEMO ? STATE.connected : true;
  liveState();
  return cfg;
}
// Eixo de dias por DATA, lido da janela da parada da unidade (painel_config,
// que segue o calendario). Antes era dia do mes de 4 a 25: a parada da 3400 e
// da 3500 vai de 16/09 a 07/10 e o dia 1 de outubro cairia antes do dia 16.
const dk=d=> d? String(d).slice(0,10) : null;               // chave do dia: AAAA-MM-DD
// Dia de hoje em Brasília (AAAA-MM-DD); toISOString() daria o dia em UTC.
function hojeBR(){ return new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}); }
const rotDia=d=> String(d).slice(8,10);                       // rotulo: dia
const dias=()=>{ const a=[]; const ini=STATE.ini, fim=STATE.fim;
  if(!ini||!fim) return a;
  const t=new Date(ini+"T12:00:00Z"), f=new Date(fim+"T12:00:00Z");
  for(let n=0; t<=f && n<120; n++){ a.push(t.toISOString().slice(0,10)); t.setUTCDate(t.getUTCDate()+1); }
  return a; };

/* ---------- agregação do ESCOPO a partir dos itens ---------- */
async function escopoAgg(){
  const DIAS=dias();
  if(DEMO){
    const mk=arr=>arr.map(([seg,prev,real,started=0,overdue=0,av=null,concl=0])=>{ const daily={}; let rest=real; DIAS.forEach(d=>{ let v=(d%4===0&&rest>0)?Math.min(rest,Math.ceil(real/8)):0; rest-=v; daily[d]=v; }); return {seg,prev,real,daily,started,overdue,concl,avanco:av!=null?av:pct(real,prev)}; });
    const sp=DEMO_DATA.escopo.reduce((a,r)=>a+r[1],0), sr=DEMO_DATA.escopo.reduce((a,r)=>a+r[2],0);
    return { escopo:mk(DEMO_DATA.escopo), extra:mk(DEMO_DATA.extra), acum:DEMO_DATA.acumDia, geral: DEMO_DATA.geral!=null?DEMO_DATA.geral:(sp?Math.round(sr/sp*100):0) };
  }
  const items=await q("planejamento_itens");
  const build=tipo=>{ const g={}; items.filter(i=>String(i.tipo_lista||"ESCOPO").toUpperCase()===tipo).forEach(i=>{ const s=i.segmento||"—"; (g[s]=g[s]||[]).push(i); });
    return Object.entries(g).map(([seg,arr])=>{ const daily={}; DIAS.forEach(d=>daily[d]=0);
      arr.forEach(i=>{ if(isDone(i)){ const d=dk(i.data_conclusao); if(daily[d]!=null) daily[d]++; } });
      // "avanco" e a media do percentual_avanco dos itens do segmento.
      // Contar so item concluido zeraria o painel inteiro num criterio de
      // conclusao que fecha no fim do ciclo (torque com foto), mesmo com o
      // campo produzindo todo dia. Real. continua sendo item concluido.
      const soma=arr.reduce((a,i)=>a+(Number(i.percentual_avanco)||0),0);
      return { seg, prev:arr.length,
               real:arr.filter(isRunning).length,     // realizado: andou na parada
               concl:arr.filter(isDone).length,       // concluido: torque com foto
               started:arr.filter(isStarted).length, overdue:arr.filter(isOverdue).length, daily,
               avanco: arr.length? soma/arr.length : 0 }; }).sort((a,b)=>b.prev-a.prev); };
  const esc=build("ESCOPO"), ext=build("EXTRA");
  // Acumulado por dia: vem da curva_s, que conta etapa cumprida. Antes vinha
  // da contagem de item concluido e, com o critério de torque com foto, ficava
  // zerado do dia 1 ao 22, deixando o painel com uma coluna inteira de zeros.
  // Dia sem linha na curva (futuro) fica nulo e nao desenha barra.
  const cs=await q("curva_s"); const porDia={};
  cs.forEach(r=>{ const d=dk(r.dia); if(d!=null) porDia[d]=Number(r.real_acum)||0; });
  const acum=DIAS.map(d=> porDia[d]!=null ? porDia[d] : null);
  const prevT=items.length;
  const somaT=items.reduce((a,i)=>a+(Number(i.percentual_avanco)||0),0);
  // O geral vem da razao de etapas gravada em curva_resumo, a MESMA medida do
  // campo-graf (etapas registradas sobre o total). A media simples do
  // percentual por LS nao serve aqui: cada segmento tem um numero diferente de
  // etapas no fluxo (PSV tem 15, filtro tem 6), e a media sem peso trata as
  // duas como iguais. Por segmento tanto faz, porque dentro do segmento o
  // fluxo e o mesmo, e ai media e razao dao o mesmo numero.
  const rzg=await q("curva_resumo");
  const pc0=rzg.find(r=>String(r.tipo).toUpperCase()==="PERCENTUAL");
  const geral = pc0 && pc0.realizado!=null ? Number(pc0.realizado)
              : (prevT? somaT/prevT : 0);
  return { escopo:esc, extra:ext, acum, geral };
}

/* ---------- render por página ---------- */
function statusTable(rows,col){ let t=[0,0,0,0]; const b=rows.map(r=>{const total=r.total||0,pe=r.pendente||0,i=r.iniciado||0,c=r.concluido||0;t[0]+=total;t[1]+=pe;t[2]+=i;t[3]+=c;
  return `<tr><td class='seg'>${r.categoria||r.item}</td><td>${total}</td><td>${pe}</td><td>${i}</td><td class='cell-hi'>${c}</td><td>${pc(c,total)}</td></tr>`;}).join("");
  return `<thead><tr><th class='l'>${col}</th><th>Total</th><th>Pend.</th><th>Inic.</th><th>Concl.</th><th>% Real</th></tr></thead><tbody>${b}
    <tr style='font-weight:700'><td class='seg'>TOTAL</td><td>${t[0]}</td><td>${t[1]}</td><td>${t[2]}</td><td>${t[3]}</td><td>${pc(t[3],t[0])}</td></tr></tbody>`; }

async function renderEscopo(){
  const A=await escopoAgg(); const DIAS=dias();
  // As 22 colunas de dia so entram quando existe producao diaria por segmento
  // para colocar nelas. Vazias elas ocupam metade da tela com zero, o que na TV
  // le como "nada feito" em vez de "esta medida ainda nao esta por segmento".
  const rows=list=>{
    const temDiario=list.some(r=>DIAS.some(d=>(r.daily[d]||0)>0));
    let head="<thead><tr><th class='l'>Segmento</th>"+`<th data-hint="${HINT_CONCL}">Status<span class="sg-i">i</span></th>`+"<th>Prev.</th>"
      +`<th data-hint="${HINT_REALIZ}">Realiz.<span class="sg-i">i</span></th>`
      +`<th data-hint="${HINT_PEND}">Pend.<span class="sg-i">i</span></th>`
      +`<th data-hint="${HINT_AVANCO}">% Avanço<span class="sg-i">i</span></th>`;
    if(temDiario) DIAS.forEach(d=>head+="<th>"+rotDia(d)+"</th>");
    head+="</tr></thead>";
    if(!list.length) return head+"<tbody><tr><td colspan='30' class='empty'>EM CONSTRUÇÃO<br><small>informação a carregar</small></td></tr></tbody>";
    let tot=[0,0,0,0], somaAv=0; let body=list.map(r=>{tot[0]+=r.prev;tot[1]+=r.real;tot[2]+=(r.concl||0);tot[3]+=(r.overdue||0); somaAv+=(r.avanco||0)*r.prev; let cells=temDiario?DIAS.map(d=>`<td>${r.daily[d]||0}</td>`).join(""):""; const st=segStatus(r);
      return `<tr><td class='seg'>${r.seg}</td><td><span class='stat ${st.c}'>${st.t}</span></td><td>${r.prev}</td><td><span class='cell-hi'>${r.real}</span></td><td>${r.prev-r.real}</td><td><span class='cell-hi'>${pf(r.avanco)}</span></td>${cells}</tr>`;}).join("");
    let tc=temDiario?DIAS.map(()=>"<td>—</td>").join(""):""; const stt=segStatus({prev:tot[0],real:tot[1],concl:tot[2],overdue:tot[3]});
    // No TOTAL entra o geral da razao de etapas, nao a media das medias, pelo
    // mesmo motivo explicado no escopoAgg.
    const totPct = (list===A.escopo && A.geral!=null) ? A.geral : (tot[0]?somaAv/tot[0]:0);
    body+=`<tr style='font-weight:700'><td class='seg'>TOTAL</td><td><span class='stat ${stt.c}'>${stt.t}</span></td><td>${br(tot[0])}</td><td><span class='cell-hi'>${br(tot[1])}</span></td><td>${tot[0]-tot[1]}</td><td><span class='cell-hi'>${pf(totPct)}</span></td>${tc}</tr>`;
    return head+"<tbody>"+body+"</tbody>"; };
  if($("#tEscopo")) $("#tEscopo").innerHTML=rows(A.escopo);
  if($("#tExtra"))  $("#tExtra").innerHTML=rows(A.extra);
  // A barra conta TAG trabalhada na parada, acumulada. A escala vai ate o total
  // de TAGs do escopo, nao ate o maior valor da serie, senao a ultima barra
  // aparece cheia e da a impressao de escopo concluido.
  const rz=await q("curva_resumo");
  const acha=t=>rz.find(r=>String(r.tipo).toUpperCase()===t)||{};
  const at=acha("ATIVIDADES"), ls=acha("LS EM EXECUCAO");
  const totTags=Number(at.previsto)||0, tagsFeitas=Number(at.realizado)||0;
  const totLs=Number(ls.previsto)||0, lsFeitas=Number(ls.realizado)||0;
  const max=Math.max(1, totTags, ...A.acum.map(v=>v||0));
  const cap=$("#dayBars")&&$("#dayBars").closest(".box")?$("#dayBars").closest(".box").querySelector(".cap"):null;
  if(cap) cap.textContent="Avanço por etapas e plaquetas iniciadas";
  const gc=document.querySelector(".gcap"); if(gc) gc.textContent="Avanço por etapas";
  if($("#dayBars")) $("#dayBars").innerHTML=
    `<div class="daybar" style="opacity:.72;font-size:11px;padding-bottom:4px">`
    +`<span></span><div style="flex:1">Plaquetas iniciadas, acumulado${totTags?" de "+br(totTags):""}</div></div>`
    +A.acum.map((v,i)=>
      v==null
        ? `<div class="daybar"><span>${rotDia(DIAS[i])}</span><div class="t"></div></div>`
        : `<div class="daybar"><span>${rotDia(DIAS[i])}</span><div class="t"><div class="f" style="width:${(v/max*100).toFixed(1)}%"><span>${br(v)}</span></div></div></div>`
    ).join("");
  // Rodape com a definicao tecnica do numero. A barra conta TAG, e uma TAG
  // pode ter varias LS, entao a equivalencia em LS fica explicita para
  // ninguem ler o 91 como se fosse LS.
  const box=$("#dayBars")?$("#dayBars").closest(".box"):null;
  if(box){
    let pe=box.querySelector(".sg-foot");
    if(!pe){ pe=document.createElement("div"); pe.className="sg-foot";
      pe.style.cssText="margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,.10);"
        +"font-size:11px;line-height:1.45;opacity:.7";
      box.appendChild(pe); }
    pe.innerHTML="Plaqueta com pelo menos uma etapa registrada em campo desde o início da parada."
      +(totTags?"<br>"+br(tagsFeitas)+" de "+br(totTags)+" plaquetas da declaração":"")
      +(totLs?", equivalentes a "+br(lsFeitas)+" de "+br(totLs)+" LS.":".");
  }
  setGauge($("#gEsc"),A.geral);
}
async function renderResumo(){
  const A=await escopoAgg(); setGauge($("#gRes"),A.geral);
  const crit=DEMO?DEMO_DATA.crit:await q("caminho_critico");
  // O Status do caminho critico vem do planejamento, nao do critério de
  // torque, então aqui não entra a dica de conclusão.
  $("#tCrit").innerHTML="<thead><tr><th class='l'>Segmento</th><th>Status</th><th>% Plan.</th><th>% Real.</th><th>% Desv.</th></tr></thead><tbody>"+
    (crit.length?crit.map(c=>`<tr><td class='seg'>${c.segmento}</td><td><span class='stat run'>${c.status||""}</span></td><td>${pf(c.pct_planejado)}</td><td>${pf(c.pct_realizado)}</td><td>${pf(c.pct_desvio)}</td></tr>`).join(""):"<tr><td colspan='5' class='empty'>EM CONSTRUÇÃO<br><small>informação a carregar</small></td></tr>")+"</tbody>";
  let tot=[0,0,0,0], somaAv=0;
  $("#tResumo").innerHTML="<thead><tr><th class='l'>Segmento</th>"+`<th data-hint="${HINT_CONCL}">Status<span class="sg-i">i</span></th>`+"<th>Plan.</th>"
    +`<th data-hint="${HINT_REALIZ}">Realiz.<span class="sg-i">i</span></th>`
    +`<th data-hint="${HINT_PEND}">Pend.<span class="sg-i">i</span></th>`
    +`<th data-hint="${HINT_AVANCO}">% Avanço<span class="sg-i">i</span></th></tr></thead><tbody>`+
    (A.escopo.length?A.escopo.map(r=>{tot[0]+=r.prev;tot[1]+=r.real;tot[2]+=(r.concl||0);tot[3]+=(r.overdue||0);somaAv+=(r.avanco||0)*r.prev;const st=segStatus(r);return `<tr><td class='seg'>${r.seg}</td><td><span class='stat ${st.c}'>${st.t}</span></td><td>${r.prev}</td><td><span class='cell-hi'>${r.real}</span></td><td>${r.prev-r.real}</td><td><span class='cell-hi'>${pf(r.avanco)}</span></td></tr>`;}).join("")+(()=>{const s=segStatus({prev:tot[0],real:tot[1],concl:tot[2],overdue:tot[3]});return `<tr style='font-weight:700'><td class='seg'>TOTAL</td><td><span class='stat ${s.c}'>${s.t}</span></td><td>${br(tot[0])}</td><td><span class='cell-hi'>${br(tot[1])}</span></td><td>${tot[0]-tot[1]}</td><td><span class='cell-hi'>${pf(A.geral!=null?A.geral:(tot[0]?somaAv/tot[0]:0))}</span></td></tr>`;})():"<tr><td colspan='6' class='empty'>EM CONSTRUÇÃO<br><small>informação a carregar</small></td></tr>")+"</tbody>";
  const v=DEMO?DEMO_DATA.psv:((await q("psv"))[0]||{});
  $("#tPsv").innerHTML=`<thead><tr><th>Total</th><th>Removidas</th><th>Montadas</th><th>Medidas</th><th>% Real</th></tr></thead><tbody><tr><td>${v.total||0}</td><td style='background:rgba(220,38,38,.16)'>${v.removido||0}</td><td style='background:rgba(217,164,65,.22)'>${v.manutencao||0}</td><td class='cell-hi'>${v.instalado||0}</td><td>${pf(v.pct_real)}</td></tr></tbody>`;
  const gm=DEMO?DEMO_DATA.gm:await q("gm_servicos"); $("#tGm").innerHTML=gm.length?statusTable(gm,"Forno"):"<tbody><tr><td class='empty'>EM CONSTRUÇÃO<br><small>informação a carregar</small></td></tr></tbody>";
  const zr=DEMO?DEMO_DATA.zr:await q("medidas_zr"); $("#tZr").innerHTML=zr.length?statusTable(zr,"Item"):"<tbody><tr><td class='empty'>EM CONSTRUÇÃO<br><small>informação a carregar</small></td></tr></tbody>";
}
async function renderGantt(){
  const rows=DEMO?DEMO_DATA.gantt:await q("gantt_tarefas");
  const body=$("#gBody"), axis=$("#gAxis");
  if(!rows.length){ body.innerHTML="<div class='empty'>EM CONSTRUÇÃO<br><small>cronograma a carregar</small></div>"; return; }
  const min=rows.reduce((m,r)=>r.data_inicio<m?r.data_inicio:m,rows[0].data_inicio);
  const max=rows.reduce((m,r)=>r.data_fim>m?r.data_fim:m,rows[0].data_fim);
  const nDays=Math.max(1,daysBetween(min,max)); const N=nDays+1;
  const mn=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const labels=[]; for(let i=0;i<N;i++){ const d=new Date(min); d.setUTCDate(d.getUTCDate()+i); labels.push(`${d.getUTCDate()} ${mn[d.getUTCMonth()]}`); }
  axis.style.gridTemplateColumns=`repeat(${N},1fr)`; axis.innerHTML=labels.map(l=>`<span>${l}</span>`).join("");
  const grupos={}; rows.forEach(r=>{ (grupos[r.grupo]=grupos[r.grupo]||[]).push(r); });
  const cls={CONCLUIDO:"",INICIADO:"run",NAO_INICIADO:"wait"};
  let html=""; Object.entries(grupos).forEach(([g,arr])=>{ html+=`<div class="grow gh"><span class="name h">${g}</span><div class="gtrack"></div></div>`;
    arr.forEach(r=>{ const left=daysBetween(min,r.data_inicio)/N*100, w=Math.max(2,(daysBetween(r.data_inicio,r.data_fim)+1)/N*100);
      html+=`<div class="grow"><span class="name">${r.tarefa}</span><div class="gtrack"><div class="gbar ${cls[r.status]||''}" style="left:${left}%;width:${w}%"></div></div></div>`; }); });
  body.innerHTML=html;
}
/* ---------- lin24: linha do Flare, juntas por diametro ----------
   Esta tela era um gantt de 11 juntas de 24 polegadas com janela de datas
   tirada do desenho, e nao do banco. Quando a tabela junta foi reimportada as
   linhas ficaram defasadas: apareciam JC 73 e JC 74, que hoje nao existem
   mais como 24 polegadas, e o painel dava duas juntas concluidas quando o
   banco tem tres.
   A PO pediu o que interessa para liberar a unidade: quantas juntas a linha
   tem por diametro e quantas estao completas, porque a linha inteira precisa
   estar fechada para voltar a operar.
   Le duas vistas, vw_painel_flare_diametro e vw_painel_flare_junta, que
   derivam de junta e junta_evento no momento da leitura. Nao passa por
   recarga, entao esta tela mostra o campo de agora.
   Junta completa = as 5 etapas de junta_etapa registradas sem reprovacao.  */
const POL_DEST=(window.TV_POL_DEST||"24");
const ETAPAS_JUNTA=[["visual_ajuste","Visual"],["dimensional","Dimens."],["raiz","Raiz"],["enchimento","Ench."],["acabamento","Acab."]];
const dmy=s=>{ const m=String(s||"").match(/^(\d{4})-(\d{2})-(\d{2})/); return m?(m[3]+"/"+m[2]):"\u2014"; };
function isoCurto(s){ s=String(s||"").trim(); if(!s) return "\u2014";
  if(s.indexOf("/")>=0) return s.split("/").pop().trim();
  const m=s.match(/^([A-Za-z]{2})[-.].*?(\d{3,})\.?$/); return m?(m[1].toUpperCase()+"-"+m[2]):s; }
// "3 de 6", com o zero em cinza para o olho achar na TV o que ainda nao andou
function fr(c,t){ c=Number(c)||0; t=Number(t)||0;
  if(!t) return "<span class='stat wait'>\u2014</span>";
  return `<span class='stat ${c>=t?"done":(c>0?"run":"bad")}'>${br(c)}</span><span style="color:var(--mut)"> de ${br(t)}</span>`; }
function polTxt(p){ const t=String(p==null?"":p); return t&&isFinite(Number(t)) ? ("\u00d8"+t.replace(".",",")+'"') : (t||"\u2014"); }

async function renderLin24(){
  const tDi=$("#tFlareDiam");
  // Compatibilidade: se a tela publicada ainda for a versao do gantt, desenha
  // o gantt em vez de deixar a caixa vazia. Assim o sigma.js pode subir antes
  // do 04-lin24.html sem apagar a tela.
  if(!tDi) return renderGantt();
  const vazio=n=>`<tr><td colspan='${n}' class='empty'>EM CONSTRU\u00c7\u00c3O<br><small>mapa de juntas a carregar</small></td></tr>`;
  const di=(await q("vw_painel_flare_diametro")).slice().sort((a,b)=>Number(b.pol_ord)-Number(a.pol_ord));
  const jt=await q("vw_painel_flare_junta");
  const tot=di.reduce((a,r)=>({j:a.j+(+r.juntas||0), c:a.c+(+r.completas||0), an:a.an+(+r.andamento||0),
      se:a.se+(+r.sem_evento||0), eo:a.eo+(+r.etapas_ok||0), et:a.et+(+r.etapas_total||0),
      jc:a.jc+(+r.juntas_campo||0), cc:a.cc+(+r.completas_campo||0),
      js:a.js+(+r.juntas_shop||0), cs:a.cs+(+r.completas_shop||0)}),
    {j:0,c:0,an:0,se:0,eo:0,et:0,jc:0,cc:0,js:0,cs:0});
  // O velocimetro conta JUNTA COMPLETA sobre o total, e nao razao de etapas:
  // a linha so libera a unidade quando a junta esta fechada, meia junta nao
  // libera nada. O rodape mostra as etapas para nao esconder o que andou.
  const pctJ = tot.j ? tot.c*100/tot.j : 0;
  setGauge($("#gFlare"), pctJ);
  const g=(id,v)=>{ const e=$(id); if(e) e.textContent=v; };
  g("#gFlareCap", tot.j ? (br(tot.c)+" de "+br(tot.j)+" juntas completas, "+pf(pctJ)) : "\u2014");
  g("#flTot", br(tot.j)); g("#flOk", br(tot.c)); g("#flPen", br(tot.j-tot.c));

  const linha=r=>{ const jn=Number(r.juntas)||0, cp=Number(r.completas)||0, an=Number(r.andamento)||0;
    const p = jn ? cp*100/jn : 0;
    const cls = (jn&&cp>=jn) ? "done" : ((cp>0||an>0) ? "run" : "bad");
    const txt = cls==="done" ? "Completo" : (cls==="bad" ? "Sem evento" : "Em andamento");
    const dest = String(r.pol)===POL_DEST;
    return `<tr${dest?" style=\"background:var(--hi);font-weight:700\"":""}>`+
      `<td class='l'>${esc(polTxt(r.pol))}</td><td>${br(jn)}</td><td>${br(cp)}</td>`+
      `<td>${fr(r.completas_campo,r.juntas_campo)}</td><td>${fr(r.completas_shop,r.juntas_shop)}</td>`+
      `<td>${br(r.sem_evento)}</td><td><span class='cell-hi'>${pf(p)}</span></td>`+
      `<td class='stat ${cls}'>${txt}</td></tr>`; };
  tDi.innerHTML="<thead><tr><th class='l'>Zona</th><th>Juntas</th><th>Completas</th>"+
    "<th>Campo</th><th>Pré-fabr.</th><th>Sem evento</th><th>% Completas</th><th>Status</th></tr></thead><tbody>"+
    (di.length ? di.map(linha).join("")+
      `<tr style="border-top:2px solid var(--line2);font-weight:800"><td class='l'>TOTAL</td>`+
      `<td>${br(tot.j)}</td><td>${br(tot.c)}</td>`+
      `<td>${fr(tot.cc,tot.jc)}</td><td>${fr(tot.cs,tot.js)}</td>`+
      `<td>${br(tot.se)}</td><td><span class='cell-hi'>${pf(pctJ)}</span></td><td></td></tr>`
      : vazio(8))+"</tbody>";

  const t24=$("#tFlare24");
  if(t24){
    const j24=jt.filter(r=>String(r.pol)===POL_DEST)
                .sort((a,b)=>String(a.plaqueta).localeCompare(String(b.plaqueta))||((+a.numero_junta||0)-(+b.numero_junta||0)));
    const NOMEL={campo:"Campo", pipeshop:"Pré-fabricação"};
    t24.innerHTML="<thead><tr><th class='l'>Junta</th><th>Plaq.</th><th>Onde</th><th class='l'>Isom\u00e9trico</th>"+
      ETAPAS_JUNTA.map(e=>`<th>${e[1]}</th>`).join("")+"<th>Ensaios</th><th>\u00daltimo</th></tr></thead><tbody>"+
      (j24.length ? j24.map(r=>{ const ok=Number(r.etapas_ok)>=5;
          return `<tr><td class='l'${ok?" style=\"font-weight:700\"":""}>${esc(r.junta)}</td>`+
            `<td>${esc(r.plaqueta)}</td><td>${esc(NOMEL[r.local_junta]||r.local_junta||"\u2014")}</td>`+
            `<td class='l'>${esc(isoCurto(r.isometrico))}</td>`+
            ETAPAS_JUNTA.map(e=>`<td>${r[e[0]]?"<span class='stat done'>\u2713</span>":"<span class='stat wait'>\u00b7</span>"}</td>`).join("")+
            `<td>${br(r.ensaios)}</td><td>${r.ultimo?dmy(r.ultimo):"\u2014"}</td></tr>`; }).join("")
        : vazio(4+ETAPAS_JUNTA.length+2))+"</tbody>";
  }
  // Campo x pipe shop, e a plaqueta logo abaixo. A tabela de diametro diz o
  // QUE falta, esta diz ONDE falta: bancada e campo tem ritmo diferente e o
  // que segura a liberacao da unidade e a junta de campo.
  const tPl=$("#tFlarePlaq");
  if(tPl){
    const loc={}, pla={};
    jt.forEach(r=>{ const ok=Number(r.etapas_ok)>=5;
      const lk=r.local_junta||"sem local";
      const l=loc[lk]||(loc[lk]={k:lk, j:0, c:0, d24:0});
      l.j++; if(ok) l.c++; if(String(r.pol)===POL_DEST) l.d24++;
      const pk=r.plaqueta||"sem plaqueta";
      const o=pla[pk]||(pla[pk]={k:pk, j:0, c:0, d24:0});
      o.j++; if(ok) o.c++; if(String(r.pol)===POL_DEST) o.d24++; });
    const NOME={campo:"Campo", pipeshop:"Pré-fabricação"}, ORDEM={campo:0, pipeshop:1};
    const locs=Object.values(loc).sort((x,y)=>(ORDEM[x.k]==null?9:ORDEM[x.k])-(ORDEM[y.k]==null?9:ORDEM[y.k]));
    const plas=Object.values(pla).sort((x,y)=>String(x.k).localeCompare(String(y.k)));
    const lin=(rot,o,forte)=>{ const p=o.j?o.c*100/o.j:0;
      return `<tr${forte?" style=\"font-weight:700\"":""}><td class='l'>${esc(rot)}</td>`+
        `<td>${br(o.j)}</td><td>${br(o.c)}</td><td>${br(o.j-o.c)}</td>`+
        `<td>${o.d24?br(o.d24):"\u2014"}</td><td><span class='cell-hi'>${pf(p)}</span></td></tr>`; };
    const cab="<tr><th class='l'>Onde</th><th>Juntas</th><th>Completas</th><th>Faltam</th>"+
              "<th>LT</th><th>% Completas</th></tr>";
    tPl.innerHTML="<thead>"+cab+"</thead><tbody>"+
      (jt.length ? locs.map(o=>lin(NOME[o.k]||o.k,o,true)).join("")+
        `<tr><td class='l' colspan='6' style="color:var(--mut);font-size:.85em;padding-top:.5em">Por plaqueta</td></tr>`+
        plas.map(o=>lin(o.k,o,false)).join("")
        : vazio(6))+"</tbody>";
  }
  // A lista de plaquetas sai do proprio dado, e nao de texto fixo: se o
  // escopo da vista mudar, o rodape muda junto e nao passa a mentir.
  const plaq=[...new Set(jt.map(r=>r.plaqueta).filter(Boolean))].sort();
  const plTxt=plaq.length+" plaquetas com solda";
  g("#flNota", tot.j ? ("Juntas dos fornos, "+plTxt+": "+br(tot.j)+" juntas ativas, "+
      br(tot.eo)+" de "+br(tot.et)+" etapas registradas. Campo "+br(tot.cc)+" de "+br(tot.jc)+
      ", pipe shop "+br(tot.cs)+" de "+br(tot.js)+". O forno s\u00f3 fecha com as juntas completas e os ensaios aprovados. "+
      "Junta completa \u00e9 visual de ajuste, dimensional, raiz, enchimento e acabamento sem reprova\u00e7\u00e3o.") : "");
}
async function renderPunch(){
  const rows=DEMO?DEMO_DATA.punch:(await q("punch_list")).map(r=>[r.item,r.equipamento,r.descricao,r.percentual_avanco]);
  $("#tPunch").innerHTML="<thead><tr><th>Item</th><th>Equip.</th><th class='l'>Descrição</th><th>% Avanço</th></tr></thead><tbody>"+
    (rows.length?rows.map(([it,eq,ds,av])=>`<tr><td>${it}</td><td>${eq||"—"}</td><td class='l'>${ds||""}</td><td><span class='cell-hi'>${pf(av)}</span></td></tr>`).join(""):"<tr><td colspan='4' class='empty'>EM CONSTRUÇÃO<br><small>informação a carregar</small></td></tr>")+"</tbody>";
}
async function renderCurvaS(){
  const cfg=DEMO?DEMO_DATA.config:((await q("painel_config"))[0]||{});
  const sc=(id,v)=>{const e=$(id); if(e)e.textContent=v||"—";};
  sc("#termPlan",cfg.termino_planejado); sc("#termReal",cfg.termino_real);
  sc("#clima",cfg.clima_temp); sc("#climaX",[cfg.clima_chuva&&("Chuva "+cfg.clima_chuva),cfg.clima_umidade&&("Umidade "+cfg.clima_umidade),cfg.clima_vento&&("Vento "+cfg.clima_vento)].filter(Boolean).join(" · "));
  sc("#paraliz",cfg.paralizacoes); sc("#analise",cfg.analise);
  const rows=DEMO?DEMO_DATA.curva:(await q("curva_s")).sort((a,b)=>a.dia<b.dia?-1:1);
  const rz=DEMO?DEMO_DATA.curvaResumo:await q("curva_resumo");
  const g=t=>rz.find(r=>String(r.tipo).toUpperCase()===t)||{previsto:0,realizado:0,restante:0};
  const p=g("PERCENTUAL");
  // Unidade sem previsto publicado (3400 e 3500 hoje) mostra traco, e nao
  // 0,00% de previsto com desvio negativo, que leria como adiantada.
  const semPrev = p.previsto==null || p.previsto==="";
  if($("#cpPrev")){$("#cpPrev").textContent=semPrev?"—":pf(p.previsto);$("#cpReal").textContent=pf(p.realizado);$("#cpDesv").textContent=semPrev?"—":pf((p.previsto||0)-(p.realizado||0));}
  const at=g("ATIVIDADES"), hh=g("HH"), et=g("ETAPAS");
  const set=(id,v)=>{const e=$(id); if(e)e.textContent=br(v);};
  set("#atP",at.previsto);set("#atR",at.realizado);set("#atS",at.restante);
  // A terceira caixa era Avanço por HH, e nao existe fonte de homem hora no
  // banco: ficava com tres zeros na tela. Quando houver linha ETAPAS ela
  // assume a caixa, porque a razao de etapas e justamente a medida que o
  // percentual do painel usa, e ver o numerador e o denominador explica o
  // percentual de cima. Se um dia entrar HH, HH volta a ter preferencia.
  const temHH = rz.some(r=>String(r.tipo).toUpperCase()==="HH");
  const caixa3 = temHH ? hh : et;
  set("#hhP",caixa3.previsto);set("#hhR",caixa3.realizado);set("#hhS",caixa3.restante);
  if(!temHH && et.previsto!=null){
    const b=$("#hhP")&&$("#hhP").closest(".box");
    const c=b?b.querySelector(".cap"):null;
    if(c) c.textContent="Avanço por etapas";
  }
  const svg=$("#curvaS"); if(!svg) return;
  if(!rows.length){ svg.parentElement.innerHTML="<div class='empty'>EM CONSTRUÇÃO<br><small>curva a carregar</small></div>"; return; }

  /* O grafico e desenhado sobre a JANELA INTEIRA da parada, e nao sobre as
     linhas que existem. Antes ele dividia a largura pelo numero de linhas: com
     6 dias lancados de 22, davam 6 barras amontoadas na esquerda e metade do
     quadro vazia, sem eixo e sem rotulo. Agora cada dia tem sua coluna fixa,
     o dia sem lancamento fica sem barra, e a curva para no ultimo dia com
     dado em vez de cair para zero. */
  // mT com folga: a legenda mora acima da area do grafico. Com margem curta
  // ela batia no rotulo da barra mais alta.
  const W=1000,H=380, mL=42, mR=46, mT=38, mB=34;
  const DIAS=dias(), N=DIAS.length;
  const bw=(W-mL-mR)/N;
  const porDia={}; rows.forEach(r=>{ const d=dk(r.dia); if(d!=null) porDia[d]=r; });
  const temSerie=k=>rows.some(r=>r[k]!=null);
  const temPrevDia=temSerie("previsto_dia"), temPrevAcum=temSerie("previsto_acum");
  const maxD=Math.max(1,...rows.map(r=>Math.max(Number(r.previsto_dia)||0,Number(r.real_dia)||0)));
  const totA=Math.max(1,...rows.map(r=>Math.max(Number(r.previsto_acum)||0,Number(r.real_acum)||0)));
  const y0=H-mB, alt=y0-mT;
  const yD=v=>y0-(v/maxD)*alt;          // escala das barras (por dia)
  const yA=v=>y0-(v/totA)*alt;          // escala das linhas (acumulado)
  const cx=i=>mL+i*bw+bw/2;
  const eixo=brandCol("--line")||"#CBD5D0", mut="#8AA79B";
  let out="";

  // grade horizontal com valor, para a barra deixar de ser numero solto
  const passos=4;
  for(let k=0;k<=passos;k++){
    const v=maxD*k/passos, y=yD(v);
    out+=`<line x1="${mL}" y1="${y.toFixed(1)}" x2="${W-mR}" y2="${y.toFixed(1)}" stroke="${eixo}" stroke-width="1" opacity="${k?0.28:0.7}"/>`
        +`<text x="${mL-6}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="12" fill="${mut}">${Math.round(v)}</text>`;
  }
  // eixo da direita, em acumulado
  for(let k=0;k<=passos;k++){
    const v=totA*k/passos;
    out+=`<text x="${W-mR+6}" y="${(yA(v)+4).toFixed(1)}" font-size="12" fill="${mut}">${br(Math.round(v))}</text>`;
  }

  // colunas por dia, com rotulo, e o dia de hoje marcado
  const hoje=new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
  DIAS.forEach((d,i)=>{
    const r=porDia[d];
    if(d===hoje) out+=`<rect x="${(mL+i*bw).toFixed(1)}" y="${mT}" width="${bw.toFixed(1)}" height="${alt}" fill="${brandCol('--g3')}" opacity=".08"/>`;
    if(r){
      const hr=y0-yD(Number(r.real_dia)||0);
      if(temPrevDia){
        const hp=y0-yD(Number(r.previsto_dia)||0);
        out+=`<rect x="${(mL+i*bw+bw*0.14).toFixed(1)}" y="${yD(Number(r.previsto_dia)||0).toFixed(1)}" width="${(bw*0.34).toFixed(1)}" height="${hp.toFixed(1)}" fill="${brandCol('--g2')}" rx="2"/>`
            +`<rect x="${(mL+i*bw+bw*0.52).toFixed(1)}" y="${yD(Number(r.real_dia)||0).toFixed(1)}" width="${(bw*0.34).toFixed(1)}" height="${hr.toFixed(1)}" fill="${brandCol('--g3')}" rx="2"/>`;
      } else if((Number(r.real_dia)||0)>0){
        out+=`<rect x="${(mL+i*bw+bw*0.22).toFixed(1)}" y="${yD(Number(r.real_dia)||0).toFixed(1)}" width="${(bw*0.56).toFixed(1)}" height="${hr.toFixed(1)}" fill="${brandCol('--g3')}" rx="2"/>`
            +`<text x="${cx(i).toFixed(1)}" y="${(yD(Number(r.real_dia)||0)-5).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="${brandCol('--g3')}">${r.real_dia}</text>`;
      }
    }
    out+=`<text x="${cx(i).toFixed(1)}" y="${(y0+16).toFixed(1)}" text-anchor="middle" font-size="12" fill="${d===hoje?brandCol('--g3'):mut}" font-weight="${d===hoje?700:400}">${rotDia(d)}</text>`;
  });
  out+=`<line x1="${mL}" y1="${y0}" x2="${W-mR}" y2="${y0}" stroke="${eixo}" stroke-width="1.5"/>`;

  // linhas de acumulado. Param no ultimo dia com dado: continuar ate o dia 25
  // desenharia a curva caindo para zero no futuro, que e leitura errada.
  const linha=(key,cor,tracejada)=>{
    const pts=DIAS.map((d,i)=>({d,i,r:porDia[d]})).filter(o=>o.r&&o.r[key]!=null)
      .map(o=>`${cx(o.i).toFixed(1)},${yA(Number(o.r[key])||0).toFixed(1)}`);
    if(pts.length<1) return "";
    return `<polyline points="${pts.join(" ")}" fill="none" stroke="${cor}" stroke-width="3"`
      +(tracejada?' stroke-dasharray="7 5"':'')+` stroke-linejoin="round"/>`
      +pts.map(p=>{const [x,y]=p.split(","); return `<circle cx="${x}" cy="${y}" r="3.5" fill="${cor}"/>`;}).join("");
  };
  out+=linha("previsto_acum","#D9A441",true)+linha("real_acum","#0EA5A0",false);

  // legenda
  // Os dois nomes sao explicitos de proposito: a barra e o movimento do dia e
  // a linha e a frente ja aberta, entao a barra NAO soma na linha. Com
  // "Realizado no dia" e "Acumulado realizado" qualquer um somaria.
  const leg=[[brandCol('--g3'),"Etapas registradas no dia"]].concat(
    temPrevDia?[[brandCol('--g2'),"Previsto no dia"]]:[]).concat(
    [["#0EA5A0","Etapas realizadas, acumulado"]]).concat(
    temPrevAcum?[["#D9A441","Acumulado previsto"]]:[]);
  let lx=mL;
  leg.forEach(([c,t])=>{
    out+=`<rect x="${lx}" y="12" width="10" height="10" rx="2" fill="${c}"/>`
        +`<text x="${lx+15}" y="21" font-size="12" fill="${mut}">${t}</text>`;
    lx+=t.length*6.7+30;
  });
  if(!temPrevAcum)
    out+=`<text x="${W-mR}" y="21" text-anchor="end" font-size="12" fill="${mut}">previsto do planejamento em construção</text>`;
  svg.innerHTML=out;
}
async function renderListOp(){
  const rows=DEMO?DEMO_DATA.listaOp:(await q("lista_operacional")).filter(r=>String(r.categoria||"PARADA").toUpperCase()==="PARADA").map(r=>[r.item_geral,r.equipamento,r.descricao,r.percentual_avanco,r.observacoes,r.impeditivo]);
  setGauge($("#gOp"),rows.length?rows.reduce((a,r)=>a+(Number(r[3])||0),0)/rows.length:0);
  if($("#opTot")){$("#opTot").textContent=rows.length;$("#opRea").textContent=rows.filter(r=>Number(r[3])>=100).length;$("#opPen").textContent=rows.filter(r=>Number(r[3])<100).length;}
  $("#tOp").innerHTML="<thead><tr><th>Item</th><th>Equip.</th><th class='l'>Descrição</th><th>% Avanço</th><th class='l'>Observações</th><th>Impeditivo</th></tr></thead><tbody>"+
    (rows.length?rows.map(([it,eq,ds,av,ob,im])=>`<tr><td>${it}</td><td>${eq||"—"}</td><td class='l'>${ds||""}</td><td><span class='cell-hi'>${pf(av)}</span></td><td class='l' style='color:var(--mut)'>${ob||""}</td><td><span class='badge ${im?"b-sim":"b-nao"}'>${im?"SIM":"NÃO"}</span></td></tr>`).join(""):"<tr><td colspan='6' class='empty'>EM CONSTRUÇÃO<br><small>informação a carregar</small></td></tr>")+"</tbody>";
}
async function renderStandby(){
  let dia,noite;
  if(DEMO){ dia=DEMO_DATA.standby.DIA; noite=DEMO_DATA.standby.NOITE; }
  else{ const rows=await q("stand_by"); const grp=t=>{const r=rows.filter(x=>String(x.turno).toUpperCase()===t); return {sup:(r[0]||{}).supervisor||"",f:r.map(x=>[x.funcao,x.quantidade||0])};};
    dia=grp("DIA"); noite=grp("NOITE"); }
  const draw=(el,data)=>{ if(!el) return; const total=data.f.reduce((a,b)=>a+b[1],0), max=Math.max(1,...data.f.map(x=>x[1]));
    // Turno sem nenhuma funcao lancada: mostra so o aviso, sem os dois zeroes
    // gigantes, que na TV pareceriam efetivo zerado em vez de dado a carregar.
    if(!data.f.length){ el.innerHTML=`<div class="empty">EM CONSTRUÇÃO<br><small>efetivo do turno a carregar</small></div>`; return; }
    el.innerHTML=`<div class="node"><b>${total}</b><span>STAND BY</span></div><div class="node"><b>${total}</b><span>${data.sup||"—"}</span></div>
      <div class="funcs">${data.f.map(([f,qn])=>`<div class="func"><span class="fn">${f}</span><div class="ft"><div class="ff" style="width:${qn/max*100}%"></div></div><b>${qn}</b></div>`).join("")}</div>`; };
  draw($("#treeDia"),dia); draw($("#treeNoite"),noite);
  const cd=$("#supDia"), cn=$("#supNoite"); if(cd)cd.textContent=dia.sup||"—"; if(cn)cn.textContent=noite.sup||"—";
}

/* ---------- menu (capa) ---------- */
async function renderMenu(){
  const cfg=DEMO?DEMO_DATA.config:((await q("painel_config"))[0]||{});
  const set=(id,v)=>{const e=$(id); if(e)e.textContent=v;};
  const units=String(cfg.unidade||CONFIG.UNIDADE).split(/[·,\/;]+/).map(s=>s.trim()).filter(Boolean);
  const ub=$("#unidade"); if(ub){ ub.innerHTML=units.join("<br>"); if(ub.parentElement) ub.parentElement.classList.toggle("multi",units.length>1); }
  set("#refinaria",cfg.refinaria||CONFIG.REFINARIA); set("#updMenu",cfg.ultima_atualizacao||"—");
  if($("#qr")) $("#qr").src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data="+encodeURIComponent(cfg.qr_url||CONFIG.QR_URL);
  const fundo=cfg.foto_url||CONFIG.FOTO_URL; const cov=document.querySelector(".cover");
  if(fundo&&cov) cov.style.setProperty("--fundo",`url("${fundo}")`);
  const logo=cfg.logo_gcb_url||CONFIG.LOGO_GCB_URL; if(logo&&$("#gcbMenu")) $("#gcbMenu").innerHTML=`<img src="${logo}" alt="GCB">`;
  const refl=cfg.refinaria_logo_url||CONFIG.REFINARIA_LOGO_URL; const re=$("#refLogo");
  if(re){ if(refl){ re.src=refl; re.style.display=""; } else re.style.display="none"; }
}

/* ---------- realtime + init ---------- */
const RENDER={menu:renderMenu,escopo:renderEscopo,resumo:renderResumo,lin24:renderLin24,punch:renderPunch,curvas:renderCurvaS,listop:renderListOp,standby:renderStandby};
const TABLES={escopo:["planejamento_itens"],resumo:["planejamento_itens","caminho_critico","psv","gm_servicos","medidas_zr"],lin24:["gantt_tarefas"] /* vista nao entra em realtime; a tela rele a cada volta da TV */,punch:["punch_list"],curvas:["curva_s","curva_resumo"],listop:["lista_operacional"],standby:["stand_by"],menu:["painel_config"]};
/* Redesenho por evento do banco, v 08/10/2026.
   A recarga do painel (pg_cron, a cada 5 min) apaga e regrava as linhas de
   todas as unidades: mais de 1.500 linhas so em planejamento_itens, e cada
   linha gera um evento postgres_changes. Antes, cada evento disparava um
   redesenho completo, centenas ao mesmo tempo, terminando fora de ordem; a
   tela pulava entre valores e piscava ("indo e voltando").
   Agora: os eventos de uma rajada viram um redesenho so, 4 s depois do ultimo
   (no maximo 20 s depois do primeiro), e nunca roda um redesenho em cima do
   outro. Se chegar evento durante um redesenho, roda mais um ao final. */
const RT_ESPERA=4000, RT_TETO=20000;
let _rtTimer=null, _rtPrimeiro=0, _rtRodando=false, _rtDeNovo=false;
function agendaRedesenho(fn){
  const agora=Date.now(); if(!_rtPrimeiro) _rtPrimeiro=agora;
  clearTimeout(_rtTimer);
  const espera=Math.max(0,Math.min(RT_ESPERA,_rtPrimeiro+RT_TETO-agora));
  _rtTimer=setTimeout(()=>redesenha(fn),espera);
}
async function redesenha(fn){
  _rtPrimeiro=0; _rtTimer=null;
  if(_rtRodando){ _rtDeNovo=true; return; }
  _rtRodando=true;
  try{ await fillHeader(); if(fn) await fn(); await renderAlerts(); }
  catch(e){ console.warn("redesenho",e.message||e); }
  finally{ _rtRodando=false; if(_rtDeNovo){ _rtDeNovo=false; agendaRedesenho(fn); } }
}
async function SIGMA_init(){
  const _qp=new URLSearchParams(location.search);
  if(_qp.get("theme")==="sigma") document.body.classList.add("sigma");
  const page=document.body.dataset.page, title=document.body.dataset.title||"";
  await resolveUns();
  buildShell(page,title);
  await fillHeader();
  const fn=RENDER[page]; if(fn) await fn();
  await renderAlerts();
  if(!DEMO){ const ch=sb.channel("sigma-"+page);
    (TABLES[page]||[]).concat(["planejamento_itens","lista_operacional","painel_config"]).forEach(t=>ch.on("postgres_changes",{event:"*",schema:"public",table:t},()=>agendaRedesenho(fn)));
    ch.subscribe(st=>setConn(st==="SUBSCRIBED")); }
  // rede de segurança: revê "dado velho" a cada minuto (mesmo sem evento)
  setInterval(liveState, 60000);
  startTvLoop();
}
/* ---------- manter a TV acordada ----------
   O navegador da webOS (LG) nao tem a API wakeLock, entao pedir wakeLock nao
   segura nada nessas TVs. O que funciona la e ter video tocando: a TV entende
   que esta exibindo midia e nao chama a protecao de tela nem o desligamento
   automatico. Sao 1,5 KB embutidos aqui, 32 por 32 pixels, preto, mudo, em
   loop, praticamente invisivel num canto. Sem arquivo externo de proposito,
   para nao depender de mais nada no repositorio. */
const WAKE_WEBM="data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAH6EU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEeTbuMU6uEHFO7a1OsggHk7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjAuMTYuMTAwV0GNTGF2ZjYwLjE2LjEwMESJiECfQAAAAAAAFlSua8GuAQAAAAAAADjXgQFzxYitZ5+3OT4qU5yBACK1nIN1bmSIgQCGhVZfVlA5g4EBI+ODhDuaygDgibCBILqBIJqBAhJUw2dAgHNzoGPAgGfImkWjh0VOQ09ERVJEh41MYXZmNjAuMTYuMTAwc3PaY8CLY8WIrWeftzk+KlNnyKVFo4dFTkNPREVSRIeYTGF2YzYwLjMxLjEwMiBsaWJ2cHgtdnA5Z8ihRaOIRFVSQVRJT05Eh5MwMDowMDowMi4wMDAwMDAwMDAAH0O2dbvngQCjoYEAAICCSYNCAAHwAfYAOCQcGEIAADBgAAAQ3//9ZrxAAKOTgQPoAIYAQJKcAElAAANgAABDQBxTu2uRu4+zgQC3iveBAfGCAaTwgQM=";
const WAKE_MP4="data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMWbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAkB0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAACAAAAAgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAAAAABAAAAAAG4bWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAQABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABY21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAASNzdGJsAAAAv3N0c2QAAAAAAAAAAQAAAK9hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAACAAIABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANWF2Y0MBZAAK/+EAGGdkAAqs2UlsBEAAAAMAQAAAAwCDxIllgAEABmjr48siwP34+AAAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAWUAAAFlAAAAAYc3R0cwAAAAAAAAABAAAAAQAAQAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAFHN0c3oAAAAAAAACygAAAAEAAAAUc3RjbwAAAAAAAAABAAADRgAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNjAuMTYuMTAwAAAACGZyZWUAAALSbWRhdAAAAq0GBf//qdxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjQgcjMxMDggMzFlMTlmOSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjMgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0xIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDM6MHgxMTMgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTEgYl9iaWFzPTAgZGlyZWN0PTEgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0yIGtleWludD0yNTAga2V5aW50X21pbj0xIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAFWWIhAAV//73ye/Apuvb3rW/YAEA+Q==";
function mantemAcordado(){
  if($("#sgWake")) return;
  const v=document.createElement("video");
  v.id="sgWake";
  // Duas fontes: WebM VP9 primeiro, MP4 H.264 como reserva. A TV da LG toca as
  // duas, mas navegador sem codec proprietario (Chromium de build livre) so
  // toca a WebM, e sem video tocando a protecao de tela volta.
  v.innerHTML='<source src="'+WAKE_WEBM+'" type="video/webm">'
             +'<source src="'+WAKE_MP4+'" type="video/mp4">';
  v.muted=true; v.defaultMuted=true; v.loop=true; v.autoplay=true;
  v.setAttribute("muted",""); v.setAttribute("playsinline","");
  // Tamanho de verdade, e nao 2 pixels: a TV precisa reconhecer que ha midia
  // tocando, e elemento minusculo corre o risco de nao contar. Fica atras de
  // tudo, quase transparente, cobrindo a tela, entao nao aparece no painel.
  v.style.cssText="position:fixed;inset:0;width:100%;height:100%;opacity:.015;"
    +"object-fit:cover;pointer-events:none;z-index:0";
  document.body.appendChild(v);
  const toca=()=>{ try{ const p=v.play(); if(p&&p.catch) p.catch(()=>{}); }catch(e){} };
  toca();
  // Algumas TVs pausam o video ao trocar de foco ou ao voltar de menu.
  // Sem esta reanimacao a protecao de tela volta depois da primeira pausa.
  setInterval(()=>{ if(v.paused||v.ended) toca(); }, 30000);
  document.addEventListener("visibilitychange",()=>{ if(!document.hidden) toca(); });
  // wakeLock quando existir (Chrome em monitor), sem depender dele
  try{ if("wakeLock" in navigator) navigator.wakeLock.request("screen").catch(()=>{}); }catch(e){}
}

/* ---------- Modo TV: gira as páginas em loop (ativa com ?tv=1 na URL) ---------- */
/* ---------- giro automatico das telas ----------
   O giro agora e o comportamento padrao: a tela troca sozinha assim que o
   painel abre, sem precisar de ?tv=1 na URL. Na TV ninguem digita parametro,
   e o botao de comecar so atrapalhava.
   Para segurar numa tela basta clicar em qualquer lugar vazio, que na LG e um
   clique do ponteiro do controle. Clicar de novo volta a girar. O estado fica
   no localStorage do proprio aparelho, entao a TV lembra que estava girando
   depois de um reinicio, e o computador de quem pausou para revisar lembra
   que estava parado.
   ?tv=0 na URL forca a tela a ficar parada, util para desenvolvimento.        */
let TV_SECS=20, TV_PROX="", TV_TIMER=null, TV_VIGIA=null, TV_BARRA=null, TV_FOI=false, TV_LIGADO=false;
function tvParado(){ try{ return localStorage.getItem("sigma-tv")==="parado"; }catch(e){ return false; } }
function tvGravaEstado(parado){ try{ localStorage.setItem("sigma-tv", parado?"parado":"girando"); }catch(e){} }
function tvDesarma(){
  if(TV_TIMER) clearTimeout(TV_TIMER);
  if(TV_VIGIA) clearInterval(TV_VIGIA);
  TV_TIMER=TV_VIGIA=null;
  if(TV_BARRA){ TV_BARRA.remove(); TV_BARRA=null; }
}
function tvArma(){
  tvDesarma(); TV_FOI=false;
  const bar=document.createElement("div"); bar.id="sgTvBar";
  bar.style.cssText="position:fixed;top:0;left:0;height:5px;background:"+brandCol("--g2")+
    ";width:0;z-index:99999;transition:width "+TV_SECS+"s linear;pointer-events:none";
  document.body.appendChild(bar); TV_BARRA=bar;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ if(TV_BARRA) TV_BARRA.style.width="100%"; }));
  // Vigia por prazo, e nao so por setTimeout. A TV suspende temporizador
  // quando a tela apaga ou o usuario abre um menu, e um setTimeout sozinho
  // simplesmente nunca dispara: o giro para e o painel congela numa tela.
  // Com o prazo, assim que a pagina volta a rodar ela cobra o atraso.
  const prazo=Date.now()+TV_SECS*1000;
  const vai=()=>{ if(TV_FOI) return; TV_FOI=true; location.href=TV_PROX; };
  TV_TIMER=setTimeout(vai, TV_SECS*1000);
  TV_VIGIA=setInterval(()=>{ if(Date.now()>=prazo) vai(); }, 2000);
}
function tvRotulo(){
  const b=$("#sgTvBtn"); if(!b) return;
  const parado=tvParado();
  b.textContent = parado ? "\u25b6 Girar" : "\u23f8 Pausar";
  b.classList.toggle("play", parado);
  b.title = parado ? "Voltar a trocar de tela sozinho" : "Segurar nesta tela";
}
function tvAviso(txt){
  let a=$("#sgTvAviso");
  if(!a){ a=document.createElement("div"); a.id="sgTvAviso";
    a.style.cssText="position:fixed;left:50%;top:2.2em;transform:translateX(-50%);z-index:99999;"+
      "background:rgba(0,0,0,.82);color:#fff;font-weight:700;letter-spacing:1px;"+
      "padding:.5em 1.4em;border-radius:99px;font-size:1.1em;pointer-events:none;"+
      "opacity:0;transition:opacity .2s";
    document.body.appendChild(a); }
  a.textContent=txt; a.style.opacity="1";
  clearTimeout(a._t); a._t=setTimeout(()=>{ a.style.opacity="0"; }, 1400);
}
function tvAlterna(){
  if(!TV_LIGADO) return;
  const parado=!tvParado();
  tvGravaEstado(parado);
  if(parado){ tvDesarma(); tvAviso("PAUSADO"); } else { tvArma(); tvAviso("GIRANDO"); }
  tvRotulo();
}
function startTvLoop(){
  const params=new URLSearchParams(location.search);
  if(params.get("tv")==="0"){                         // trava de desenvolvimento
    const b0=$("#sgTvBtn"); if(b0) b0.style.display="none"; return; }
  TV_SECS=Math.max(5, parseInt(params.get("t"))||CONFIG.ROTATE_SECONDS);
  mantemAcordado();
  // o que segue adiante na troca de tela
  const theme=params.get("theme")==="sigma"?"&theme=sigma":"";
  const demo=params.get("demo"); const demoP=demo?"&demo="+demo:"";
  const cur=(location.pathname.split("/").pop())||"01-menu.html";
  const PG=paginas();
  let i=PG.findIndex(p=>p[0]===cur); if(i<0) i=0;
  TV_PROX=PG[(i+1)%PG.length][0]+"?t="+TV_SECS+theme+demoP+(unsQs()?"&"+unsQs():"");
  TV_LIGADO=true;
  // Clique em area vazia pausa e retoma. Clique em link, botao, celula de
  // tabela com dica ou no botao de foco nao conta: senao a pessoa pausaria o
  // painel sem querer toda vez que mexesse em qualquer controle.
  document.addEventListener("click", e=>{
    if(e.target.closest("a,button,input,select,textarea,label,.sg-foco-btn,.sg-i,#sgCard,#sgFundo")) return;
    tvAlterna();
  });
  tvRotulo();
  if(!tvParado()) tvArma();
}
document.addEventListener("DOMContentLoaded",SIGMA_init);
