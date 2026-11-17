import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Radar,
  ArrowUpRight,
  TrendingUp,
  Target,
  Wallet,
  Search,
  SlidersHorizontal,
  RefreshCw,
  LayoutGrid,
  List,
  MapPin,
  Flame,
  ArrowDownWideNarrow,
  X,
  Bookmark,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { leads, filterLeads } from '@/lib/leads';
import { useRadar } from './context';
import { LeadCard } from './lead-card';
import { toast } from 'sonner';
import { useServerFn } from '@tanstack/react-start';
import { findOpportunities } from '@/lib/radar.functions';

function Filter({
  value,
  onChange,
  label,
  options,
  icon: Icon,
}: {
  value: string;
  onChange: (s: string) => void;
  label: string;
  options: string[];
  icon: typeof MapPin;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-10 min-w-0 bg-card shadow-none">
        <span className="flex min-w-0 items-center gap-2 text-xs">
          <Icon className="size-3.5 text-muted-foreground" />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}</SelectItem>
        {options.map((o) => (
          <SelectItem value={o} key={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RadarPage({ crm = false }: { crm?: boolean }) {
  const { saved, discarded, monitoring, realLeads, setRealLeads, service, keywords, regions } = useRadar();
  const find = useServerFn(findOpportunities);
  const pool = [...(realLeads ?? []), ...leads];

  const [search, setSearch] = useState('');
  const [niche, setNiche] = useState('all');
  const [urgency, setUrgency] = useState('all');
  const [city, setCity] = useState('all');
  const [sort, setSort] = useState('score');
  const [layout, setLayout] = useState('grid');
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('all');

  const all = (crm ? pool : realLeads ?? leads).filter((l) =>
    crm ? saved.includes(l.id) : !discarded.includes(l.id),
  );

  const filtered = filterLeads(all, search, niche, tab === 'high' ? 'Alta' : urgency, city).sort((a, b) =>
    sort === 'score' ? b.score - a.score : a.id - b.id,
  );

  const hasFilters = search || niche !== 'all' || urgency !== 'all' || city !== 'all' || tab !== 'all';

  // Cálculos dinâmicos para os KPIs baseados nos leads ativos (reais ou demo)
  const highIntentCount = all.filter((l) => l.urgency === 'Alta' || l.score >= 70).length;
  const totalPipelineValue = all.reduce((acc, l) => acc + (l.value || 0), 0);
  const formattedPipeline = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(totalPipelineValue);

  function clear() {
    setSearch('');
    setNiche('all');
    setUrgency('all');
    setCity('all');
    setTab('all');
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const r = await find({ data: { service, keywords, regions } });
      if (r.error) toast.error(r.error);
      else {
        setRealLeads(r.leads);
        clear();
        toast.success(
          r.leads.length
            ? `${r.leads.length} oportunidades reais encontradas na web`
            : 'Nenhuma oportunidade real encontrada agora. Ajuste as palavras-chave.',
        );
      }
    } catch {
      toast.error('Não foi possível buscar agora. Tente novamente.');
    } finally {
      setRefreshing(false);
    }
  }

  const kpis = [
    {
      label: 'Novos sinais hoje',
      value: String(all.length),
      icon: Radar,
      trend: realLeads ? 'Atualizado da web agora' : '+4 em relação a ontem',
      style: 'info',
      detail: 'trend',
    },
    {
      label: 'Alta probabilidade de fechamento',
      value: String(highIntentCount),
      icon: Target,
      trend: 'Leads prontos para uma conversa',
      style: 'success',
      detail: 'dot',
    },
    {
      label: 'Valor estimado em pipeline',
      value: realLeads ? formattedPipeline : 'R$ 84.000',
      icon: TrendingUp,
      trend: realLeads ? 'Soma das oportunidades ativas' : '+18% nesta semana',
      style: 'info',
      detail: 'trend',
    },
    {
      label: 'Créditos disponíveis',
      value: '45',
      icon: Wallet,
      trend: 'Renovação em 01 de dezembro',
      style: 'warning',
      detail: 'credits',
    },
  ];

  return (
    <main className="mx-auto max-w-[1600px] px-5 py-7 md:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            INTELIGÊNCIA COMERCIAL
          </div>
          <h1 className="text-[26px] font-bold leading-tight">
            {crm ? 'Leads Salvos' : 'Radar de Oportunidades'}
            <span className="text-primary">.</span>
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {crm
              ? 'Suas melhores oportunidades, em um só lugar.'
              : 'Encontre quem precisa da sua solução. No momento certo.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-9 bg-card text-xs shadow-none" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Buscando na web...' : 'Buscar oportunidades reais'}
          </Button>
          <Button asChild className="h-9 text-xs">
            <Link to="/nichos">
              <SlidersHorizontal />
              Configurar radar
            </Link>
          </Button>
        </div>
      </div>

      {!crm && (
        <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {kpis.map((k, i) => (
            <div key={k.label} className="rounded-lg border bg-card p-4 xl:p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="max-w-44 text-[11px] font-medium leading-5 text-muted-foreground">{k.label}</span>
                <div
                  className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
                    k.style === 'success'
                      ? 'bg-success-soft text-success'
                      : k.style === 'warning'
                        ? 'bg-warning-soft text-warning'
                        : 'bg-info-soft text-primary'
                  }`}
                >
                  <k.icon size={17} />
                </div>
              </div>
              <div className="mt-3 text-[28px] font-bold leading-none">
                {k.value}
                {i === 3 && <span className="ml-1 text-base font-normal text-muted-foreground">/ 50</span>}
              </div>
              {i === 3 && (
                <div className="mt-3 h-1 rounded-full bg-muted">
                  <div className="h-full w-[90%] rounded-full bg-primary" />
                </div>
              )}
              <div
                className={`mt-3 flex items-center gap-1 text-[10px] ${
                  k.detail === 'trend' ? 'text-success' : 'text-muted-foreground'
                }`}
              >
                {k.detail === 'trend' && <ArrowUpRight size={12} />}
                {k.detail === 'dot' && <span className="size-1.5 rounded-full bg-success" />}
                {k.trend}
              </div>
            </div>
          ))}
        </div>
      )}

      {!crm && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/10 bg-info-soft px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="relative flex size-8 shrink-0 items-center justify-center text-primary">
              <Radar className={monitoring ? 'radar-sweep' : ''} size={25} strokeWidth={1.4} />
            </span>
            <div>
              <p className="text-xs font-medium">
                Seu radar está {monitoring ? 'de olho nas próximas oportunidades' : 'pausado'}.
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                4 nichos · 5 regiões · Fontes públicas e sinais de intenção
              </p>
            </div>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-success/15 bg-card px-2.5 py-1 text-[10px] font-medium text-success">
            <span className="status-dot" />
            {monitoring ? 'Monitoramento ativo' : 'Pausado'}
          </span>
        </div>
      )}

      <section>
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="relative">
            <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input
              aria-label="Buscar oportunidades"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa, palavra-chave..."
              className="h-10 bg-card pl-9 text-xs shadow-none"
            />
          </div>
          <Filter
            value={niche}
            onChange={setNiche}
            label="Todos os nichos"
            options={[...new Set(all.map((l) => l.niche))]}
            icon={LayoutGrid}
          />
          <Filter
            value={urgency}
            onChange={setUrgency}
            label="Todas as urgências"
            options={['Alta', 'Média', 'Baixa']}
            icon={Flame}
          />
          <Filter
            value={city}
            onChange={setCity}
            label="Todas as regiões"
            options={[...new Set(all.map((l) => l.city))]}
            icon={MapPin}
          />
        </div>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              className={`h-11 rounded-none border-b-2 px-0 text-xs hover:bg-transparent ${
                tab === 'all' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
              onClick={() => setTab('all')}
            >
              {crm ? 'Salvos' : 'Todas as oportunidades'}
              <span className="rounded bg-info-soft px-1.5 py-0.5 text-[10px]">{all.length}</span>
            </Button>
            <Button
              variant="ghost"
              className={`h-11 rounded-none border-b-2 px-0 text-xs hover:bg-transparent ${
                tab === 'high' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
              onClick={() => setTab('high')}
            >
              <Flame size={12} />
              <span className="hidden sm:inline">Alta intenção</span>
              <span className="sm:hidden">Alta</span>
            </Button>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger aria-label="Ordenar oportunidades" className="h-7 w-auto gap-2 border-0 text-[11px] shadow-none">
                <ArrowDownWideNarrow size={13} className="text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Maior intenção</SelectItem>
                <SelectItem value="recent">Mais recentes</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex rounded border bg-card p-0.5">
              <Button
                variant={layout === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                className="size-6 rounded-sm shadow-none"
                title="Visualização em grade"
                aria-label="Visualização em grade"
                onClick={() => setLayout('grid')}
              >
                <LayoutGrid size={13} />
              </Button>
              <Button
                variant={layout === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                className="size-6 rounded-sm shadow-none"
                title="Visualização em lista"
                aria-label="Visualização em lista"
                onClick={() => setLayout('list')}
              >
                <List size={13} />
              </Button>
            </div>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">{filtered.length} oportunidades</span>{' '}
            {crm ? 'no seu CRM' : 'encontradas para você'}
          </p>
          {hasFilters ? (
            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={clear}>
              <X size={11} />
              Limpar filtros
            </Button>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="size-1 rounded-full bg-muted-foreground" />
              {realLeads ? 'Resultados reais da web' : 'Dados demonstrativos'}
            </span>
          )}
        </div>

        {filtered.length ? (
          <div className={`grid gap-4 ${layout === 'grid' ? 'lg:grid-cols-2 2xl:grid-cols-3' : 'grid-cols-1'}`}>
            {filtered.map((l) => (
              <LeadCard key={l.id} lead={l} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 border-b text-center">
            <div className="rounded-full bg-info-soft p-4 text-primary">
              {crm ? <Bookmark size={28} /> : <Search size={28} />}
            </div>
            <h2 className="text-lg font-semibold">
              {crm && !hasFilters ? 'Seu CRM está pronto para novas oportunidades' : 'Nenhuma oportunidade encontrada'}
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {crm && !hasFilters
                ? 'As oportunidades que você salvar no radar aparecerão aqui.'
                : 'Tente outra palavra-chave ou amplie os filtros.'}
            </p>
            {hasFilters ? (
              <Button variant="outline" onClick={clear}>
                Limpar filtros
              </Button>
            ) : (
              <Button asChild>
                <Link to="/">
                  Explorar oportunidades
                  <ArrowUpRight />
                </Link>
              </Button>
            )}
          </div>
        )}
      </section>

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Radar size={13} />
          PriceSearch · Menos prospecção. Mais conexão.
        </span>
        <span>{realLeads ? 'Monitoramento em tempo real ativo' : 'Ambiente demonstrativo · Contatos fictícios'}</span>
      </footer>
    </main>
  );
}