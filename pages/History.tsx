import {useMemo,useState} from "react";
import {Search,History as HistoryIcon} from "lucide-react";
import {useMetrics,useNow} from "@/hooks/useApp";
import {useAppStore} from "@/store/appStore";
import {useT} from "@/lib/i18n";
import {ShiftListItem} from "@/components/ShiftListItem";
import {EmptyState,FieldLabel,SelectField,TextField} from "@/components/m3";
import {periodRange} from "@/domain/stats";
import {toLocalDate} from "@/domain/time";
export default function HistoryPage(){
 const t=useT();const {shifts}=useAppStore();const now=useNow(60000);const metrics=useMetrics(now);
 const [query,setQuery]=useState("");const [period,setPeriod]=useState("all");const [sort,setSort]=useState("newest");
 const list=useMemo(()=>{let a=shifts.filter(s=>s.status!=="cancelled");if(period==="month"){const r=periodRange("month",toLocalDate(now));a=a.filter(s=>s.date>=r.from&&s.date<=r.to)}if(period==="last"){const r=periodRange("month",toLocalDate(now),-1);a=a.filter(s=>s.date>=r.from&&s.date<=r.to)}const q=query.trim().toLocaleLowerCase();if(q)a=a.filter(s=>(s.notes+" "+s.date+" "+s.shiftType).toLocaleLowerCase().includes(q));return a.sort((x,y)=>sort==="oldest"?x.startTimestamp-y.startTimestamp:sort==="earnings"?(metrics.get(y.id)?.totalPay??0)-(metrics.get(x.id)?.totalPay??0):sort==="duration"?(metrics.get(y.id)?.workedMs??0)-(metrics.get(x.id)?.workedMs??0):y.startTimestamp-x.startTimestamp)},[shifts,period,query,sort,metrics,now]);
 return <div className="flex flex-col gap-4">
  <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-variant"/><TextField className="pl-10" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")}/></div>
  <div className="grid grid-cols-2 gap-3"><div><FieldLabel>{t("month")}</FieldLabel><SelectField value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">{t("all")}</option><option value="month">{t("thisMonth")}</option><option value="last">{t("lastMonth")}</option></SelectField></div><div><FieldLabel>{t("sort")}</FieldLabel><SelectField value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">{t("sortNewest")}</option><option value="oldest">{t("sortOldest")}</option><option value="earnings">{t("sortEarnings")}</option><option value="duration">{t("sortDuration")}</option></SelectField></div></div>
  <p className="text-sm text-on-surface-variant">{t("found",{n:list.length})}</p>
  {list.length===0?<EmptyState icon={<HistoryIcon/>} title={query?t("noResults"):t("emptyHistory")} text={query?t("noResultsText"):t("emptyHistoryText")}/>:<div className="flex flex-col gap-3">{list.map(s=><ShiftListItem key={s.id} shift={s} metrics={metrics.get(s.id)}/>)}</div>}
 </div>
}