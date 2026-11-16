import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { Lead } from '@/lib/leads';
import { loadWorkspaceFn, saveConfigFn, setLeadStateFn } from '@/lib/workspace.functions';

type RadarState = {
  saved: number[];
  discarded: number[];
  save: (id: number) => void;
  discard: (id: number) => void;
  monitoring: boolean;
  setMonitoring: (v: boolean) => void;
  service: string;
  setService: (v: string) => void;
  keywords: string;
  setKeywords: (v: string) => void;
  regions: string;
  setRegions: (v: string) => void;
  realLeads: Lead[] | null;
  setRealLeads: (v: Lead[]) => void;
  persistConfig: () => void;
};

const Context = createContext<RadarState | null>(null);

const SAVE_FAILED = 'Não foi possível gravar no banco. A alteração vale só nesta sessão.';

export function RadarProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<number[]>([]);
  const [discarded, setDiscarded] = useState<number[]>([]);
  const [monitoring, setMonitoringState] = useState(true);
  const [service, setService] = useState('Instalação de Energia Solar Comercial');
  const [keywords, setKeywords] = useState('conta de luz alta, orçamento fotovoltaica, eficiência energética');
  const [regions, setRegions] = useState('Belo Horizonte, MG; Contagem, MG');
  const [realLeads, setRealLeads] = useState<Lead[] | null>(null);

  // Hidrata o estado salvo no banco. Sem banco configurado, o app segue só em memória.
  useEffect(() => {
    let cancelled = false;
    loadWorkspaceFn()
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          console.warn('Workspace não carregado do banco:', r.error);
          return;
        }
        setSaved(r.saved);
        setDiscarded(r.discarded);
        setRealLeads(r.realLeads.length ? r.realLeads : null);
        if (r.config) {
          setService(r.config.service);
          setKeywords(r.config.keywords);
          setRegions(r.config.regions);
          setMonitoringState(r.config.monitoring);
        }
      })
      .catch((e) => console.warn('Falha ao carregar o workspace', e));
    return () => {
      cancelled = true;
    };
  }, []);

  function persistLead(leadId: number, patch: { saved?: boolean; discarded?: boolean }) {
    setLeadStateFn({ data: { leadId, ...patch } })
      .then((r) => {
        if (!r.ok) toast.error(SAVE_FAILED);
      })
      .catch(() => toast.error(SAVE_FAILED));
  }

  function persistConfigWith(next: { service: string; keywords: string; regions: string; monitoring: boolean }) {
    saveConfigFn({ data: next })
      .then((r) => {
        if (!r.ok) toast.error(SAVE_FAILED);
      })
      .catch(() => toast.error(SAVE_FAILED));
  }

  return (
    <Context.Provider
      value={{
        realLeads,
        setRealLeads,
        saved,
        discarded,
        save: (id) => {
          const next = !saved.includes(id);
          setSaved((s) => (next ? [...s, id] : s.filter((x) => x !== id)));
          toast.success(next ? 'Lead salvo no CRM' : 'Lead removido do CRM');
          persistLead(id, { saved: next });
        },
        discard: (id) => {
          setDiscarded((s) => [...s, id]);
          persistLead(id, { discarded: true });
          toast('Oportunidade descartada', {
            action: {
              label: 'Desfazer',
              onClick: () => {
                setDiscarded((s) => s.filter((x) => x !== id));
                persistLead(id, { discarded: false });
              },
            },
          });
        },
        monitoring,
        setMonitoring: (v) => {
          setMonitoringState(v);
          persistConfigWith({ service, keywords, regions, monitoring: v });
        },
        service,
        setService,
        keywords,
        setKeywords,
        regions,
        setRegions,
        persistConfig: () => persistConfigWith({ service, keywords, regions, monitoring }),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useRadar() {
  const context = useContext(Context);
  if (!context) throw new Error('RadarProvider required');
  return context;
}
