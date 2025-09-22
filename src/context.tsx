import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Calljmp } from './client';
import { Config } from './config';

interface CalljmpContextType {
  client: Calljmp;
}

const CalljmpContext = createContext<CalljmpContextType | undefined>(undefined);

export function CalljmpProvider({
  calljmp,
  client,
  config,
  children,
}: {
  calljmp?: Calljmp;
  client?: Calljmp;
  config?: Partial<Config>;
  children: ReactNode;
}) {
  const value = useMemo(() => {
    const resolved = client ?? calljmp ?? new Calljmp(config);
    return { client: resolved };
  }, [client, calljmp, config]);

  return (
    <CalljmpContext.Provider value={value}>{children}</CalljmpContext.Provider>
  );
}

export function useCalljmp() {
  const context = useContext(CalljmpContext);
  if (!context || !context.client) {
    throw new Error(
      'useCalljmp must be used within a CalljmpProvider with a valid client instance'
    );
  }
  return context;
}
